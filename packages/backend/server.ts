import { isAbsolute, relative, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { AppConfig, BackendConfig as BackendDefaults } from "config";
import type { BackendConfig, BackendStatus } from "shared/contracts";

/** API and production assets share an origin; Vite proxies these routes in development. */
export function startServer(
  config: BackendConfig,
  counters = new Int32Array(new SharedArrayBuffer(4)),
) {
  const started = performance.now();
  const root = resolve(config.assetsDir);
  // Compiled assets are immutable Blobs. Do not pass their virtual paths through
  // realpath(), which is for validating ordinary files on the host filesystem.
  const embedded = Bun.isStandaloneExecutable
    ? new Map(
        (Bun.embeddedFiles as readonly (Blob & { name: string })[])
          .filter((file) => file.name.startsWith("frontend/"))
          .map((file) => [file.name.slice("frontend/".length), file]),
      )
    : undefined;
  const insideRoot = (path: string, base = root) => {
    const local = relative(base, path);
    return (
      !isAbsolute(local) &&
      local !== ".." &&
      !local.startsWith("..\\") &&
      !local.startsWith("../")
    );
  };
  const status = (): BackendStatus => ({
    ok: true,
    app: AppConfig,
    uptime: Math.floor((performance.now() - started) / 1000),
    requests: Atomics.load(counters, 0),
  });
  const server = Bun.serve({
    hostname: config.host ?? BackendDefaults.defaults.host,
    port: config.port,
    async fetch(request) {
      const url = new URL(request.url);
      Atomics.add(counters, 0, 1);
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      if (url.pathname === "/api/status") {
        const response = Response.json(status(), {
          headers: { "Cache-Control": "no-store" },
        });
        return request.method === "HEAD"
          ? new Response(null, response)
          : response;
      }
      if (url.pathname.startsWith("/api/"))
        return Response.json({ error: "Not found" }, { status: 404 });
      if (url.pathname === "/webui.js") {
        if (!config.bridgeOrigin)
          return new Response(
            "/* Browser preview: native WebUI bridge is not running. */",
            {
              headers: {
                "Content-Type": "text/javascript",
                "Cache-Control": "no-store",
              },
            },
          );
        try {
          const bridge = await fetch(
            new URL("/webui.js", config.bridgeOrigin),
            {
              headers: { Cookie: request.headers.get("cookie") ?? "" },
              signal: AbortSignal.timeout(5000),
            },
          );
          if (!bridge.ok)
            throw new Error(`WebUI bridge returned ${bridge.status}`);
          const headers = new Headers({
            "Content-Type": "text/javascript",
            "Cache-Control": "no-store",
          });
          // WebUI authenticates its WebSocket with the cookie issued alongside this script.
          for (const cookie of bridge.headers.getSetCookie())
            headers.append("Set-Cookie", cookie);
          return new Response(request.method === "HEAD" ? null : bridge.body, {
            headers,
          });
        } catch {
          return new Response(
            "/* WebUI bridge unavailable. Restart the desktop host. */",
            { status: 503, headers: { "Content-Type": "text/javascript" } },
          );
        }
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Invalid path", { status: 400 });
      }
      if (pathname.includes("\0") || pathname.includes("\\"))
        return new Response("Invalid path", { status: 400 });
      const path = resolve(root, `.${pathname}`);
      if (!insideRoot(path)) return new Response("Forbidden", { status: 403 });
      if (embedded) {
        const key = pathname.replace(/^\/+/, "");
        const index = `${key}${!key || key.endsWith("/") ? "" : "/"}index.html`;
        const file = embedded.get(key) ?? embedded.get(index);
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(request.method === "HEAD" ? null : file, {
          headers: {
              "Content-Type": file.type || Bun.file(file.name).type,
            "Cache-Control": "no-cache",
          },
        });
      }
      // Astro's static build emits /route/index.html; missing assets must stay 404s.
      for (const candidate of [path, resolve(path, "index.html")]) {
        try {
          const actual = await realpath(candidate);
          // Both sides must use canonical paths. Windows temp directories can
          // have short-name aliases; a configured root can also be a symlink.
          if (!insideRoot(actual, await realpath(root))) continue;
          const file = Bun.file(actual);
          if (!(await file.stat()).isFile()) continue;
          return new Response(request.method === "HEAD" ? null : file, {
            headers: { "Content-Type": file.type, "Cache-Control": "no-cache" },
          });
        } catch {
          /* Try the directory index, then return 404. */
        }
      }
      return new Response(
        "Not found. Run bun run build to generate the frontend.",
        { status: 404 },
      );
    },
  });
  return { server, status };
}

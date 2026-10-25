import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../packages/backend/server";
import { startBackend } from "../packages/desktop/backend";
import type { BackendStatus } from "../packages/shared/contracts";
import { AppConfig } from "../packages/config/config";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test("backend worker reports readiness, serves API, shares counters, and stops cleanly", async () => {
  const runtime = await startBackend({ port: 0 });
  cleanups.push(() => runtime.stop());
  const response = await fetch(`${runtime.origin}/api/status`);
  expect(response.status).toBe(200);
  const data = (await response.json()) as BackendStatus;
  expect(data.ok).toBe(true);
  expect(data.app).toEqual(AppConfig);
  expect(Atomics.load(new Int32Array(runtime.backend.shared.metrics), 0)).toBe(
    data.requests,
  );
  const status = await runtime.backend.Emit<BackendStatus>("backend:status");
  expect(status.requests).toBe(data.requests);
});

test("backend pushes live values through the generic window dispatch RPC", async () => {
  const received = Promise.withResolvers<{ name: string; detail: unknown }>();
  const runtime = await startBackend({ port: 0 }, (name, detail) => received.resolve({ name, detail }));
  cleanups.push(() => runtime.stop());
  const pump = setInterval(() => runtime.backend.update(), 16);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const event = await Promise.race([
      received.promise,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("No backend push received")), 3000); }),
    ]);
    expect(event.name).toBe("backend:metrics");
    expect(event.detail).toMatchObject({ uptime: expect.any(Number), requests: expect.any(Number) });
  } finally { clearInterval(pump); clearTimeout(timeout); }
});

test("static server serves Astro routes and assets with correct methods, without exposing parent files", async () => {
  const temp = await mkdtemp(join(tmpdir(), "astro-desktop-test-"));
  cleanups.push(() => rm(temp, { recursive: true, force: true }));
  const assetsDir = join(temp, "dist");
  await mkdir(join(assetsDir, "docs"), { recursive: true });
  await Bun.write(join(assetsDir, "index.html"), "<h1>Application</h1>");
  await Bun.write(join(assetsDir, "docs/index.html"), "<h1>Documentation</h1>");
  await Bun.write(join(assetsDir, "app.css"), "body { color: red; }");
  await Bun.write(join(temp, "secret.txt"), "do not serve");
  const { server } = startServer({ port: 0, assetsDir });
  cleanups.push(() => server.stop(true));
  expect(await (await fetch(server.url)).text()).toContain("Application");
  expect(await (await fetch(new URL("/docs/", server.url))).text()).toContain(
    "Documentation",
  );
  expect(
    (await fetch(new URL("/app.css", server.url))).headers.get("content-type"),
  ).toContain("text/css");
  expect((await fetch(new URL("/missing.js", server.url))).status).toBe(404);
  expect(
    (await fetch(new URL("/api/status", server.url), { method: "POST" }))
      .status,
  ).toBe(405);
  expect(
    await (
      await fetch(new URL("/docs/", server.url), { method: "HEAD" })
    ).text(),
  ).toBe("");
  const traversal = await fetch(`${server.url.origin}/%2e%2e%2fsecret.txt`);
  expect(traversal.status).toBe(403);
  expect(await traversal.text()).not.toContain("do not serve");
  const bridge = await fetch(new URL("/webui.js", server.url));
  expect(bridge.status).toBe(200);
  expect(await bridge.text()).toContain("Browser preview");
});

test("static roots can resolve through directory aliases without allowing links outside the root", async () => {
  const temp = await mkdtemp(join(tmpdir(), "astro-static-alias-"));
  cleanups.push(() => rm(temp, { recursive: true, force: true }));
  const assets = join(temp, "assets");
  const outside = join(temp, "outside");
  const alias = join(temp, "alias");
  await mkdir(assets);
  await mkdir(outside);
  await Bun.write(join(assets, "index.html"), "<h1>Alias works</h1>");
  await Bun.write(join(outside, "secret.txt"), "private");
  const kind = process.platform === "win32" ? "junction" : "dir";
  await symlink(assets, alias, kind);
  await symlink(outside, join(assets, "escape"), kind);
  const { server } = startServer({ port: 0, assetsDir: alias });
  cleanups.push(() => server.stop(true));
  expect(await (await fetch(server.url)).text()).toContain("Alias works");
  const escaped = await fetch(new URL("/escape/secret.txt", server.url));
  expect(escaped.status).toBe(404);
  expect(await escaped.text()).not.toContain("private");
});

test("bridge route forwards the native WebUI script and reports upstream failure", async () => {
  let cookie = "";
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      cookie = request.headers.get("cookie") ?? "";
      return new Response("window.webui = {};", {
        headers: {
          "Set-Cookie": "webui_auth=test; Path=/; HttpOnly; SameSite=Strict",
        },
      });
    },
  });
  cleanups.push(() => upstream.stop(true));
  const { server } = startServer({
    port: 0,
    assetsDir: ".",
    bridgeOrigin: upstream.url.origin,
  });
  cleanups.push(() => server.stop(true));
  const bridge = await fetch(new URL("/webui.js", server.url), {
    headers: { Cookie: "webui_auth=test" },
  });
  expect(await bridge.text()).toContain("window.webui");
  expect(bridge.headers.get("set-cookie")).toContain("webui_auth=test");
  expect(cookie).toBe("webui_auth=test");
  await upstream.stop(true);
  expect((await fetch(new URL("/webui.js", server.url))).status).toBe(503);
});

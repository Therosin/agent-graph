import { fileURLToPath } from "node:url";
import { BackendConfig as BackendDefaults } from "config";
import Worker, { type Channel } from "shared/WorkerRPC";
import type { BackendConfig, SharedMetrics } from "shared/contracts";
import { startServer } from "./server";

if (Bun.isMainThread) {
  // Browser development / static preview also runs without the native desktop host.
  const { server } = startServer({
    host: BackendDefaults.defaults.host,
    port: Number(process.env.BACKEND_PORT ?? BackendDefaults.defaults.port),
    assetsDir: fileURLToPath(new URL("../astro/dist/", import.meta.url)),
  });
  console.log(`Backend listening on ${server.url}`);
  const shutdown = async () => {
    await server.stop(true);
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} else {
  // Install the parent listener before the first await.
  const parent = Worker.Parent as Channel<BackendConfig, SharedMetrics>;
  await parent.ready;
  const { server, status } = startServer(
    parent.data,
    new Int32Array(parent.shared.metrics),
  );
  parent.On("backend:status", status);
  // Example: push small live values; full application data still comes from HTTP.
  let pushing = false;
  const metrics = setInterval(() => {
    if (pushing) return;
    const { uptime, requests } = status();
    pushing = true;
    void parent.Emit("window:dispatch", {
      name: "backend:metrics", detail: { uptime, requests },
    }).catch((error) => console.error("Backend metrics push failed:", error))
      .finally(() => { pushing = false; });
  }, 1000);
  parent.On("backend:shutdown", async () => {
    clearInterval(metrics);
    await server.stop(true);
    return { stopped: true };
  });
  await parent.Emit("backend:ready", { origin: server.url.origin });
}

import { fileURLToPath } from "node:url";
import { BackendConfig as BackendDefaults } from "config";
import Worker from "shared/WorkerRPC";
import type { WindowDispatcher } from "./dispatch";
import type {
  BackendConfig,
  BackendInfo,
  SharedMetrics,
} from "shared/contracts";

export async function startBackend(config: Partial<BackendConfig> = {}, dispatch?: WindowDispatcher) {
  const backend = new Worker<BackendConfig, SharedMetrics>(
    Bun.isStandaloneExecutable
      ? new URL("./bundle/backend.js", import.meta.url)
      : new URL("../backend/main.ts", import.meta.url),
    {
      name: "api-backend",
      data: {
        host: config.host ?? BackendDefaults.defaults.host,
        port: config.port ?? Number(process.env.BACKEND_PORT ?? BackendDefaults.defaults.port),
        assetsDir:
          config.assetsDir ??
          fileURLToPath(
            new URL(
              Bun.isStandaloneExecutable ? "./frontend/" : "../astro/dist/",
              import.meta.url,
            ),
          ),
        bridgeOrigin: config.bridgeOrigin,
      },
      shared: { metrics: new SharedArrayBuffer(16) },
    },
  );
  let ready!: (info: BackendInfo) => void;
  const started = new Promise<BackendInfo>((resolve) => {
    ready = resolve;
  });
  backend.On("backend:ready", (info: BackendInfo) => {
    ready(info);
    return true;
  });
  backend.On("window:dispatch", (event: { name: string; detail?: unknown }) => {
    if (!event || typeof event.name !== "string" || !event.name.trim())
      throw new Error("Window event name must not be empty");
    if (!dispatch) return false;
    dispatch(event.name, event.detail);
    return true;
  });
  // Keep dispatch alive before the WebView loop starts, and again during shutdown.
  const pump = setInterval(() => backend.update(), 16);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const info = await Promise.race([
      backend.ready.then(() => started),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Backend did not start within 10 seconds")),
          10_000,
        );
      }),
    ]);
    return {
      backend,
      ...info,
      async stop() {
        const pump = setInterval(() => backend.update(), 16);
        try {
          await backend.Emit("backend:shutdown");
        } finally {
          clearInterval(pump);
          backend.terminate();
        }
      },
    };
  } catch (error) {
    backend.terminate();
    throw error;
  } finally {
    clearInterval(pump);
    clearTimeout(timeout);
  }
}

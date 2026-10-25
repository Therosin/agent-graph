import { fileURLToPath } from "node:url";
import { BackendConfig, FrontendConfig } from "../packages/config/config";

const root = fileURLToPath(new URL("../", import.meta.url));
const frontend = fileURLToPath(new URL("../packages/astro/", import.meta.url));
const web = process.argv.includes("--web");
const smokeTest = process.argv.includes("--smoke-test");
const port = Number(process.env.ASTRO_PORT ?? FrontendConfig.defaults.port);
const origin = `http://${FrontendConfig.defaults.host}:${port}`;
const env = {
  ...process.env,
  ASTRO_PORT: String(port),
  BACKEND_PORT: process.env.BACKEND_PORT ?? String(BackendConfig.defaults.port),
};

// Do not attach to or later stop a different project's development server.
for (const [host, candidate] of [
  [FrontendConfig.defaults.host, port],
  [BackendConfig.defaults.host, Number(env.BACKEND_PORT)],
] as const) {
  const probe = Bun.serve({
    hostname: host,
    port: candidate,
    fetch: () => new Response(),
  });
  await probe.stop(true);
}

async function astro(...args: string[]) {
  const child = Bun.spawn([process.execPath, "run", "astro", ...args], {
    cwd: frontend,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code) throw new Error(`astro ${args.join(" ")} exited with ${code}`);
}

let child: ReturnType<typeof Bun.spawn> | undefined;
let started = false;
let stopping = false;
const stop = () => {
  stopping = true;
  child?.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  // Per packages/astro/AGENTS.md, let Astro manage its own background server.
  await astro("dev", "--background");
  started = true;
  if (stopping) throw new Error("Development startup cancelled");
  child = Bun.spawn(
    [
      process.execPath,
      web
        ? "packages/backend/main.ts"
        : smokeTest
          ? "scripts/test-native.ts"
          : "packages/desktop/main.ts",
    ],
    {
      cwd: root,
      env: { ...env, ASTRO_DEV_ORIGIN: origin },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  console.log(`${web ? "Browser" : "Desktop"} development: ${origin}`);
  const code = await child.exited;
  if (code && !stopping) process.exitCode = code;
} finally {
  child?.kill("SIGTERM");
  if (started) await astro("dev", "stop");
}

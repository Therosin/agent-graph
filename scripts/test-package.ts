import { cp, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { packageOptions, packageTarget } from "./package-target";
import { loadBuildConfig } from "./build-config";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const { AppConfig, TrayConfig } = await loadBuildConfig(packageOptions(args).define);
const options = packageOptions(args, AppConfig.id);
if (options.target !== packageTarget().target)
  throw new Error("The package smoke test can only execute the host target");
const build = Bun.spawn([process.execPath, "run", "build", ...args], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (await build.exited) throw new Error("Package build failed");

// Copy only the distributable into a new directory, with an unrelated working directory.
const tempRoot = await realpath(tmpdir());
const temporary = await mkdtemp(join(tempRoot, "astro-desktop-package-"));
const appDir = join(temporary, "application with spaces");
const cwd = join(temporary, "unrelated working directory");
let child: ReturnType<typeof Bun.spawn> | undefined;
try {
  await mkdir(appDir);
  await mkdir(cwd);
  const executable = join(appDir, options.executable);
  await cp(join(root, "build", options.executable), executable);
  const dialogLibraryDirectory = join(root, "build", "native", "dialogs", process.platform, process.arch);
  if (await Bun.file(join(dialogLibraryDirectory, options.os === "windows" ? "nfd.dll" : options.os === "darwin" ? "libnfd.dylib" : "libnfd.so")).exists())
    await cp(dialogLibraryDirectory, join(appDir, "native", "dialogs", process.platform, process.arch), { recursive: true });
  if (options.os !== "linux")
    await cp(join(root, "build", "native", "toast", process.platform), join(appDir, "native", "toast", process.platform), { recursive: true });
  const trayIcon = TrayConfig.icons[process.platform as keyof typeof TrayConfig.icons];
  if (trayIcon && (process.platform === "win32" || /[\\/]/.test(trayIcon)))
    await cp(join(root, "build", "native", "tray", process.platform), join(appDir, "native", "tray", process.platform), { recursive: true });
  if (options.offline)
    await cp(
      join(root, "build", options.archive),
      join(appDir, options.archive),
      { recursive: true },
    );
  // Loading a .env from the invocation directory would break this run.
  await Bun.write(
    join(cwd, ".env"),
    "WEBUI_PORT=-1\nASTRO_DEV_ORIGIN=http://127.0.0.1:1\n",
  );
  const env: Record<string, string | undefined> = {
    ...process.env,
    BACKEND_PORT: "0",
    PATH: options.os === "linux" ? process.env.PATH : "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    NO_PROXY: "localhost,127.0.0.1",
    TEMP: tempRoot,
    TMP: tempRoot,
  };
  delete env.ASTRO_DEV_ORIGIN;
  delete env.WEBUI_PORT;
  delete env.BUN_BE_BUN;
  if (options.offline) {
    // Loopback still works, but an attempted first-run native download must fail.
    env.HTTP_PROXY = "http://127.0.0.1:9";
    env.HTTPS_PROXY = "http://127.0.0.1:9";
  }
  // CI uses a private D-Bus tray host/notification server on Linux. The system
  // Python has the distribution's GI/D-Bus modules installed by the workflow.
  const command = process.platform === "linux" && process.env.NATIVE_TRAY_TEST_HOST === "1"
    ? ["/usr/bin/python3", join(root, "tests", "fixtures", "linux-tray-host.py"), executable]
    : [executable, "--smoke-test"];
  async function runPackage() {
    const launched = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
    child = launched;
    const stdout = new Response(launched.stdout).text();
    const stderr = new Response(launched.stderr).text();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const code = await Promise.race([
      launched.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          launched.kill();
          reject(new Error("Packaged app timed out"));
        }, 120_000);
      }),
    ]).finally(() => clearTimeout(timer));
    return { code, output: await stdout, errors: await stderr };
  }
  let result = await runPackage();
  const startupFailure = Bun.stripANSI(result.errors).match(/^error: WebUI could not open a WebView[:.].*$/m);
  // Fresh hosted Windows machines can fail their first WebView initialization.
  // Retry only that pre-ready failure, once, with the exact same restrictions.
  // A failed smoke assertion or a second startup failure still fails the job.
  if (process.env.CI === "true" && options.os === "windows" && result.code !== 0 &&
      !result.output.includes(" ready:") && startupFailure) {
    console.warn(`Cold Windows WebView startup failed before readiness; restarting the same package once. ${startupFailure[0]}`);
    await Bun.sleep(1000);
    result = await runPackage();
  }
  const { code, output, errors } = result;
  if (output) console.log(output.trimEnd());
  if (errors) console.error(errors.trimEnd());
  if (code !== 0) throw new Error(`Packaged app exited with ${code}`);
  if (!output.includes("PASS native close button closes the window"))
    throw new Error("Packaged smoke checks did not finish");
  const library = Bun.file(join(appDir, options.archive, options.library));
  if (!(await library.exists()) || !library.size)
    throw new Error(
      "Native library was not found beside the relocated executable",
    );
  if ((await readdir(cwd)).some((name) => name !== ".env"))
    throw new Error(
      "Packaged app wrote runtime files into its working directory",
    );
  console.log(
    `PASS relocated package (${options.offline ? "offline library" : "first-run native download"}), native toasts, ${options.os === "linux" ? "system notify-send" : "empty PATH"}, embedded frontend/worker, unrelated cwd`,
  );
} finally {
  child?.kill();
  // Delete only the fresh, task-owned temporary directory created above.
  if (
    !resolve(temporary).startsWith(resolve(tempRoot) + sep) ||
    !temporary.includes("astro-desktop-package-")
  )
    throw new Error("Invalid package test cleanup path");
  await rm(temporary, { recursive: true, force: true });
}

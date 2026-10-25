import { cp, mkdir, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BunPlugin } from "bun";
import AdmZip from "adm-zip";
import { packageOptions } from "./scripts/package-target";
import { configBuildPlugin, loadBuildConfig } from "./scripts/build-config";
import { stageToastHelpers } from "./scripts/package-toasts";
import { stageDialogLibrary } from "./scripts/package-dialogs";

if (process.argv.includes("--help")) {
  console.log(
    'bun run build [--target=bun-windows-arm64] [--offline] [--console] [--define \'APP_VERSION="1.2.3"\']',
  );
  process.exit(0);
}
const args = process.argv.slice(2);
const define = {
  BUILD_TIME: JSON.stringify(new Date().toISOString()),
  ...packageOptions(args).define,
};
const { AppConfig, TrayConfig } = await loadBuildConfig(define);
const options = packageOptions(args, AppConfig.id);

const root = fileURLToPath(new URL("./", import.meta.url));
const bundle = join(root, "bundle");
const output = join(root, "build");
await mkdir(bundle, { recursive: true });
await mkdir(output, { recursive: true });

const frontend = Bun.spawn([process.execPath, "run", "build:frontend"], {
  cwd: root,
  env: { ...process.env, APP_BUILD_DEFINES: JSON.stringify(define) },
  stdout: "inherit",
  stderr: "inherit",
});
if (await frontend.exited) throw new Error("Astro build failed");

// Use a fresh staging directory per build so removed frontend assets cannot leak into a release.
const stage = join(bundle, "stage");
// This fixed, workspace-owned staging directory is the only directory the build replaces.
if (resolve(stage) !== join(root, "bundle", "stage"))
  throw new Error("Invalid staging path");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(join(root, "packages", "astro", "dist"), join(stage, "frontend"), {
  recursive: true,
});
await stageToastHelpers(options.os, stage, output);
await stageDialogLibrary(options.os, options.arch, stage, output);
// Configured icon files follow the executable; Linux theme names need no asset.
const trayPlatform = options.os === "windows" ? "win32" : options.os;
const trayIcon = TrayConfig.icons[trayPlatform as keyof typeof TrayConfig.icons];
if (trayIcon && (trayPlatform === "win32" || /[\\/]/.test(trayIcon))) {
  const relative = join("native", "tray", trayPlatform, "icon" + extname(trayIcon));
  await mkdir(resolve(stage, relative, ".."), { recursive: true });
  await cp(resolve(root, trayIcon), join(stage, relative));
  await mkdir(resolve(output, relative, ".."), { recursive: true });
  await cp(join(stage, relative), join(output, relative));
}

const backend = await Bun.build({
  entrypoints: [join(root, "packages", "backend", "main.ts")],
  target: "bun",
  define,
  plugins: [configBuildPlugin(define)],
  outdir: bundle,
  naming: { entry: "backend.js" },
});
if (!backend.success)
  throw new AggregateError(backend.logs, "Backend bundle failed");

const webuiEntry = Bun.resolveSync("WebUI", join(root, "packages", "desktop"));
const webuiUtils = resolve(webuiEntry, "..", "src", "utils.js");
const nativePaths: BunPlugin = {
  name: "webui-compiled-executable-path",
  setup(build) {
    build.onLoad({ filter: /[\\/]utils\.js$/ }, async (args) => {
      if (resolve(args.path) !== webuiUtils) return;
      // WebUI's compiled resolver intends to use the executable directory. In Bun
      // 1.4.2 argv[0] is literally "bun"; execPath is the actual relocated executable.
      const contents = (await Bun.file(args.path).text()).replace(
        'process.argv[0] ?? "."',
        "process.execPath",
      );
      return { contents, loader: "js" };
    });
  },
};

// An explicit executable entry avoids relying on import.meta.main in a multi-entry build.
const entrypoint = join(stage, "entry.ts");
await Bun.write(
  entrypoint,
  `import { runDesktop } from ${JSON.stringify(join(root, "packages", "desktop", "main.ts"))};\ntry {\n if (process.argv.includes("--smoke-test")) console.log("Compiled app:", Bun.embeddedFiles.length, "embedded frontend assets");\n const verify = process.argv.includes("--smoke-test") ? (await import(${JSON.stringify(join(root, "packages", "desktop", "smoke.ts"))})).verifyDesktop : undefined;\n await runDesktop(verify);\n process.exit(0);\n} catch (error) { console.error(error); process.exit(1); }\n`,
);

const executable = join(output, options.executable);
const result = await Bun.build({
  root,
  entrypoints: [entrypoint, join(bundle, "backend.js")],
  target: "bun",
  define,
  compile: {
    outfile: executable,
    target: options.target,
    assets: [join(stage, "frontend")],
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadPackageJson: false,
    autoloadTsconfig: false,
    windows:
      options.os === "windows"
        ? {
            hideConsole: !options.console,
            ...(process.platform === "win32"
              ? {
                  title: AppConfig.appName,
                  version: AppConfig.appVersion,
                  description: AppConfig.appDescription,
                }
              : {}),
          }
        : undefined,
  },
  minify: !options.console,
  plugins: [configBuildPlugin(define), nativePaths],
});
if (!result.success)
  throw new AggregateError(result.logs, "Executable build failed");

if (options.offline) {
  // The target determines the archive, even when the build runs on a different OS/architecture.
  const release = process.env.WEBUI_RELEASE ?? "nightly";
  const url = `https://github.com/webui-dev/webui/releases/download/${encodeURIComponent(release)}/${options.archive}.zip`;
  console.log(`Downloading WebUI for ${options.target}: ${url}`);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`WebUI download failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(join(bundle, "downloads"), { recursive: true });
  await Bun.write(join(bundle, "downloads", `${options.archive}.zip`), bytes);
  const zip = new AdmZip(bytes);
  const library = zip.readFile(`${options.archive}/${options.library}`);
  if (!library)
    throw new Error(`Missing ${options.library} in the target WebUI archive`);
  const stagedLibrary = join(stage, options.archive, options.library);
  await mkdir(resolve(stagedLibrary, ".."), { recursive: true });
  await Bun.write(stagedLibrary, library);
  await cp(resolve(stagedLibrary, ".."), join(output, options.archive), {
    recursive: true,
  });
  const license = zip.readFile(`${options.archive}/LICENSE`);
  if (license)
    await Bun.write(join(output, options.archive, "LICENSE"), license);
  console.log(
    `Offline native library: ${join(output, options.archive, options.library)}`,
  );
}
console.log(
  `Packaged executable: ${executable} (${(Bun.file(executable).size / 1024 / 1024).toFixed(1)} MiB)`,
);

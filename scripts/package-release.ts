import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { loadBuildConfig } from "./build-config";
import { packageOptions } from "./package-target";

/** Archive only the selected target and its native assets, never all of build/. */
export async function packageRelease(args: string[], root = fileURLToPath(new URL("../", import.meta.url))) {
  const config = loadBuildConfig(packageOptions(args).define);
  const options = packageOptions(args, config.AppConfig.id);
  if (options.os !== "windows" && options.os !== "linux") throw new Error("Release archives currently target Windows and Linux");
  const build = join(root, "build");
  const bundle = join(root, "bundle");
  const output = join(build, "releases");
  await mkdir(bundle, { recursive: true });
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(join(bundle, "release-"));
  const app = join(temporary, config.AppConfig.id);
  await mkdir(app);
  try {
    const platform = options.os === "windows" ? "win32" : "linux";
    const library = options.os === "windows" ? "nfd.dll" : "libnfd.so";
    const required = [options.executable, join(options.archive, options.library)];
    if (options.arch === "x64") required.push(join("native", "dialogs", platform, options.arch, library));
    for (const path of required) {
      if (!await Bun.file(join(build, path)).exists()) throw new Error(`Missing release asset: ${path}. Build this target with --offline first.`);
    }
    await cp(join(build, options.executable), join(app, options.executable));
    await cp(join(build, options.archive), join(app, options.archive), { recursive: true });
    if (options.arch === "x64") await cp(join(build, "native", "dialogs", platform, options.arch), join(app, "native", "dialogs", platform, options.arch), { recursive: true });
    if (options.os === "windows") await cp(join(build, "native", "toast", platform), join(app, "native", "toast", platform), { recursive: true });
    const icon = config.TrayConfig.icons[platform];
    if (icon && (platform === "win32" || /[\\/]/.test(icon)))
      await cp(join(build, "native", "tray", platform), join(app, "native", "tray", platform), { recursive: true });
    if (options.os === "linux") await chmod(join(app, options.executable), 0o755);
    const requirements = options.os === "windows"
      ? "Requires Windows with the Microsoft Edge WebView2 Runtime."
      : "Requires a Linux graphical session with WebKitGTK 4.1, GTK3, notify-send and a notification server, an AppIndicator tray host, and wl-clipboard (Wayland) or xsel (X11).";
    await Bun.write(join(app, "README.txt"), `${config.AppConfig.appName} ${config.AppConfig.appVersion}\n\nRun ${options.executable} from this folder. Keep the native and ${options.archive} folders beside it.\n${requirements}\nFor full platform setup, see docs/Packaging.md in the source repository.\n`);
    const filename = `${config.AppConfig.id}-${options.os}-${options.arch}${options.os === "windows" ? ".zip" : ".tar.gz"}`;
    const archive = join(output, filename);
    if (options.os === "windows") {
      const zip = new AdmZip();
      zip.addLocalFolder(app, config.AppConfig.id);
      zip.writeZip(archive);
    } else {
      const child = Bun.spawn(["tar", "-czf", archive, "-C", temporary, config.AppConfig.id], { stdout: "inherit", stderr: "inherit" });
      if (await child.exited) throw new Error("Release archive failed");
    }
    const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(archive).arrayBuffer()).digest("hex");
    await Bun.write(archive + ".sha256", `${digest}  ${filename}\n`);
    return archive;
  } finally {
    const local = relative(resolve(bundle), resolve(temporary));
    if (!local.startsWith("release-") || local.includes(sep)) throw new Error("Invalid release staging path");
    await rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) console.log(`Release archive: ${await packageRelease(process.argv.slice(2))}`);

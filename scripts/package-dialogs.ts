import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Select the file-dialog library by build target, including cross-compilation. */
export async function stageDialogLibrary(os: string, arch: string, stage: string, output: string) {
  const platform = os === "windows" ? "win32" : os;
  // These are the prebuilt targets published by nativefiledialog-for-bun 0.3.2.
  if (!(arch === "x64" || (platform === "darwin" && arch === "arm64"))) {
    console.log(`File dialogs on ${platform}-${arch} will use the package's system-script fallback.`);
    return;
  }
  const desktop = fileURLToPath(new URL("../packages/desktop/", import.meta.url));
  const packageRoot = dirname(dirname(Bun.resolveSync("nativefiledialog-for-bun", desktop)));
  const { version } = await Bun.file(join(packageRoot, "package.json")).json();
  const library = platform === "win32" ? "nfd.dll" : platform === "darwin" ? "libnfd.dylib" : "libnfd.so";
  const asset = `nfd-${platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux"}-${arch}${platform === "win32" ? ".dll" : platform === "darwin" ? ".dylib" : ".so"}`;
  const installed = join(packageRoot, "bin", platform, arch, library);
  const bundled = join(packageRoot, "bin", asset);
  const destination = join(stage, "native", "dialogs", platform, arch);
  await mkdir(destination, { recursive: true });
  if (await Bun.file(installed).exists()) {
    await cp(installed, join(destination, library));
  } else if (await Bun.file(bundled).exists()) {
    await cp(bundled, join(destination, library));
  } else {
    const url = `https://github.com/Catharacta/nativefiledialog-for-bun/releases/download/v${version}/${asset}`;
    console.log(`Downloading file-dialog library for ${platform}-${arch}: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`File-dialog download failed: ${response.status} ${url}`);
    await Bun.write(join(destination, library), await response.arrayBuffer());
  }
  await cp(join(packageRoot, "LICENSE"), join(destination, "LICENSE"));
  // The README includes the nativefiledialog-extended zlib license notice.
  await cp(join(packageRoot, "README.md"), join(destination, "THIRD-PARTY-NOTICES.md"));
  await cp(destination, join(output, "native", "dialogs", platform, arch), { recursive: true });
  console.log(`File-dialog library: ${join(output, "native", "dialogs", platform, arch, library)}`);
}

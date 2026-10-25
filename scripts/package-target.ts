import type { Build } from "bun";
import { AppConfig } from "../packages/config/config";
import { parseDefine } from "./build-config";

export function packageTarget(
  value = `bun-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`,
) {
  const match = /^bun-(windows|linux|darwin)-(x64|arm64)$/.exec(value);
  if (!match)
    throw new Error(
      `Unsupported desktop target: ${value}. Use bun-{windows,linux,darwin}-{x64,arm64}.`,
    );
  const os = match[1]!;
  const arch = match[2]!;
  const archive = `webui-${os === "darwin" ? "macos" : os}-${os === "windows" ? "msvc" : os === "darwin" ? "clang" : "gcc"}-${arch}`;
  const library =
    os === "windows"
      ? "webui-2.dll"
      : os === "darwin"
        ? "libwebui-2.dylib"
        : "libwebui-2.so";
  return { target: value as Build.CompileTarget, os, arch, archive, library };
}

export function packageOptions(args: string[], appId = AppConfig.id) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(appId))
    throw new Error("Application id must be a filename-safe lowercase identifier");
  const define: Record<string, string> = {};
  let target: string | undefined;
  let explicitTarget = false;
  let offline = false;
  let showConsole = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--offline") offline = true;
    else if (argument === "--console") showConsole = true;
    else if (argument === "--define" || argument.startsWith("--define=")) {
      const value = argument === "--define"
        ? args[++index]
        : argument.slice("--define=".length);
      if (!value) throw new Error("--define requires NAME=JSON");
      const [name, expression] = parseDefine(value);
      define[name] = expression;
    } else if (argument.startsWith("--target=")) {
      target = argument.slice("--target=".length);
      explicitTarget = true;
    } else if (argument === "--target") {
      target = args[++index];
      explicitTarget = true;
      if (!target) throw new Error("--target requires a Bun target");
    } else throw new Error(`Unknown build option: ${argument}`);
  }
  const platform = packageTarget(target);
  const executable = `${appId}${explicitTarget ? `-${platform.os}-${platform.arch}` : ""}${platform.os === "windows" ? ".exe" : ""}`;
  return { ...platform, offline, console: showConsole, executable, define };
}

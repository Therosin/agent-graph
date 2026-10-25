import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { dlopen, read, toArrayBuffer, type Pointer } from "bun:ffi";
import envPaths from "env-paths";
import { AppConfig } from "config";
import type { NativePathName, NativePaths } from "shared/native-paths";
import type { DesktopEvents } from "../events";

const folders = {
  documents: "FDD39AD0-238F-46AF-ADB4-6C85480369C7",
  downloads: "374DE290-123F-4565-9164-39C4925E467B",
  desktop: "B4BFCC3A-DB2C-424C-B029-7FE99A87C641",
};

let windows: ReturnType<typeof loadWindows> | undefined;
function loadWindows() {
  return {
    shell: dlopen("shell32.dll", {
      SHGetKnownFolderPath: { args: ["buffer", "u32", "ptr", "buffer"], returns: "i32" },
    }),
    ole: dlopen("ole32.dll", {
      CoTaskMemFree: { args: ["ptr"], returns: "void" },
    }),
  };
}

function knownFolder(id: string): string {
  windows ??= loadWindows();
  const parts = id.split("-");
  const guid = Buffer.alloc(16);
  guid.writeUInt32LE(parseInt(parts[0]!, 16), 0);
  guid.writeUInt16LE(parseInt(parts[1]!, 16), 4);
  guid.writeUInt16LE(parseInt(parts[2]!, 16), 6);
  Buffer.from(parts[3]! + parts[4]!, "hex").copy(guid, 8);
  const output = Buffer.alloc(8);
  const result = windows.shell.symbols.SHGetKnownFolderPath(guid, 0, null, output);
  const address = Number(output.readBigUInt64LE()) as Pointer;
  try {
    if (result < 0 || !address)
      throw new Error(`Windows known-folder lookup failed (0x${(result >>> 0).toString(16)})`);
    let length = 0;
    while (length < 32768 && read.u16(address, length * 2)) length++;
    return Buffer.from(toArrayBuffer(address, 0, length * 2)).toString("utf16le");
  } finally {
    if (address) windows.ole.symbols.CoTaskMemFree(address);
  }
}

function userFolders() {
  const home = homedir();
  if (process.platform === "win32") return {
    home,
    documents: knownFolder(folders.documents),
    downloads: knownFolder(folders.downloads),
    desktop: knownFolder(folders.desktop),
  };
  const result = { home, documents: join(home, "Documents"), downloads: join(home, "Downloads"), desktop: join(home, "Desktop") };
  if (process.platform === "linux") {
    const keys = { XDG_DOCUMENTS_DIR: "documents", XDG_DOWNLOAD_DIR: "downloads", XDG_DESKTOP_DIR: "desktop" } as const;
    let content = "";
    try { content = readFileSync(join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "user-dirs.dirs"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const line of content.split(/\r?\n/)) {
      const match = /^\s*(XDG_(?:DOCUMENTS|DOWNLOAD|DESKTOP)_DIR)="((?:\\.|[^"\\])*)"\s*(?:#.*)?$/.exec(line);
      if (!match) continue;
      const value = match[2]!.replace(/\$\{HOME\}|\$HOME(?=\/|$)/g, home).replace(/\\([\\"$`])/g, "$1");
      if (isAbsolute(value)) result[keys[match[1] as keyof typeof keys]] = value;
    }
  }
  return result;
}

function appPaths() { return envPaths(AppConfig.id, { suffix: "" }); }
function all(): NativePaths { return { ...appPaths(), ...userFolders() }; }
function get(name: NativePathName): string {
  const paths = all();
  if (!Object.hasOwn(paths, name)) throw new Error(`Unknown native path: ${String(name)}`);
  return paths[name];
}

export default {
  register(events: DesktopEvents): void {
    events.on("native:paths:list", all);
    events.on<{ name: NativePathName }>("native:paths:get", (request) => get(request?.name));
  },
  all,
  get,
  app: appPaths,
  user: userFolders,
};

import { lstat } from "node:fs/promises";
import { isAbsolute, resolve, parse } from "node:path";
import { pathToFileURL } from "node:url";
import { CFunction, CString, dlopen, read, type Pointer } from "bun:ffi";
import open from "open";
import revealFile from "reveal-file";
import { ShellConfig } from "config";
import type { DesktopEvents } from "../events";

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error("Expected a non-empty string without null characters");
  return value;
}

async function existingPath(value: string): Promise<string> {
  text(value);
  if (!isAbsolute(value)) throw new Error("Native shell paths must be absolute");
  await lstat(value);
  return value;
}

async function command(args: string[]): Promise<void> {
  const child = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(error.trim() || `${args[0]} failed (${code})`);
}

function launchLinux(target: string): void {
  // Some xdg-open backends stay alive until the opened application closes.
  // Match open()'s default: acknowledge launch, without waiting for that app.
  const child = Bun.spawn(["xdg-open", target], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  child.unref();
}

async function openExternal(value: string): Promise<void> {
  const url = new URL(text(value));
  if (!ShellConfig.defaults.allowedSchemes.includes(url.protocol)) throw new Error(`External URL scheme is not allowed: ${url.protocol}`);
  if (process.platform === "linux") launchLinux(url.href);
  else await open(url.href);
}

async function openPath(value: string): Promise<void> {
  const path = await existingPath(value);
  if (process.platform === "linux") launchLinux(path);
  else await open(path);
}

async function revealPath(value: string): Promise<void> {
  const path = await existingPath(value);
  if (process.platform === "linux") await command([
    "gdbus", "call", "--session", "--dest", "org.freedesktop.FileManager1",
    "--object-path", "/org/freedesktop/FileManager1", "--method", "org.freedesktop.FileManager1.ShowItems",
    `['${pathToFileURL(path).href.replaceAll("'", "%27")}']`, "",
  ]);
  else await revealFile(path);
}

function guid(value: string): Buffer {
  const parts = value.split("-");
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(parseInt(parts[0]!, 16));
  bytes.writeUInt16LE(parseInt(parts[1]!, 16), 4);
  bytes.writeUInt16LE(parseInt(parts[2]!, 16), 6);
  Buffer.from(parts[3]! + parts[4]!, "hex").copy(bytes, 8);
  return bytes;
}

function check(result: number): void {
  if (result < 0) throw new Error(`Recycle Bin operation failed (0x${(result >>> 0).toString(16)})`);
}

function method(object: Pointer, index: number): Pointer {
  const table = read.ptr(object);
  const address = table && read.ptr(table, index * 8);
  if (!address) throw new Error("Missing Windows shell method");
  return address as Pointer;
}

function release(object: Pointer): void {
  CFunction({ ptr: method(object, 2), args: ["ptr"], returns: "u32" })(object);
}

function recycleWindows(path: string): void {
  const ole = dlopen("ole32.dll", {
    CoInitializeEx: { args: ["ptr", "u32"], returns: "i32" },
    CoUninitialize: { args: [], returns: "void" },
    CoCreateInstance: { args: ["buffer", "ptr", "u32", "buffer", "buffer"], returns: "i32" },
  });
  const shell = dlopen("shell32.dll", {
    SHCreateItemFromParsingName: { args: ["buffer", "ptr", "buffer", "buffer"], returns: "i32" },
  });
  const initialized = ole.symbols.CoInitializeEx(null, 2);
  if (initialized < 0 && (initialized >>> 0) !== 0x80010106) check(initialized);
  let operation: Pointer | null = null;
  let item: Pointer | null = null;
  try {
    const out = Buffer.alloc(8);
    check(ole.symbols.CoCreateInstance(guid("3AD05575-8857-4850-9277-11B85BDB8E09"), null, 1, guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), out));
    operation = Number(out.readBigUInt64LE()) as Pointer;
    check(shell.symbols.SHCreateItemFromParsingName(Buffer.from(path + "\0", "utf16le"), null, guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), out));
    item = Number(out.readBigUInt64LE()) as Pointer;
    // RECYCLEONDELETE + undo record; WANTNUKEWARNING prevents silent permanent
    // deletion if Windows cannot recycle an item.
    const flags = 0x00080000 | 0x20000000 | 0x00100000 | 0x0040 | 0x0400 | 0x4000 | 0x2000 | 0x0010 | 0x0004;
    check(CFunction({ ptr: method(operation, 5), args: ["ptr", "u32"], returns: "i32" })(operation, flags));
    check(CFunction({ ptr: method(operation, 18), args: ["ptr", "ptr", "ptr"], returns: "i32" })(operation, item, null));
    check(CFunction({ ptr: method(operation, 21), args: ["ptr"], returns: "i32" })(operation));
    const aborted = Buffer.alloc(4);
    check(CFunction({ ptr: method(operation, 22), args: ["ptr", "buffer"], returns: "i32" })(operation, aborted));
    if (aborted.readInt32LE()) throw new Error("Recycle Bin operation was cancelled or could not complete");
  } finally {
    if (item) release(item);
    if (operation) release(operation);
    if (initialized >= 0) ole.symbols.CoUninitialize();
    shell.close();
    ole.close();
  }
}

function trashLinux(path: string): void {
  const gio = dlopen("libgio-2.0.so.0", {
    g_file_new_for_path: { args: ["buffer"], returns: "ptr" },
    g_file_trash: { args: ["ptr", "ptr", "buffer"], returns: "bool" },
  });
  const glib = dlopen("libglib-2.0.so.0", { g_error_free: { args: ["ptr"], returns: "void" } });
  const gobject = dlopen("libgobject-2.0.so.0", { g_object_unref: { args: ["ptr"], returns: "void" } });
  const file = gio.symbols.g_file_new_for_path(Buffer.from(path + "\0"));
  const out = Buffer.alloc(8);
  try {
    if (!gio.symbols.g_file_trash(file, null, out)) {
      const error = Number(out.readBigUInt64LE()) as Pointer;
      const message = error && read.ptr(error, 8);
      throw new Error(message ? new CString(message).toString() : "File could not be moved to Trash");
    }
  } finally {
    const error = Number(out.readBigUInt64LE()) as Pointer;
    if (error) glib.symbols.g_error_free(error);
    if (file) gobject.symbols.g_object_unref(file);
    gio.close(); glib.close(); gobject.close();
  }
}

async function trashPath(value: string): Promise<void> {
  const path = await existingPath(value);
  if (resolve(path) === parse(path).root) throw new Error("A filesystem root cannot be trashed");
  if (process.platform === "win32") recycleWindows(path);
  else if (process.platform === "linux") trashLinux(path);
  else throw new Error("Native trash is currently implemented for Windows and Linux");
}

export default {
  register(events: DesktopEvents): void {
    events.on<{ url: string }>("native:shell:open-external", (request) => openExternal(request?.url));
    events.on<{ path: string }>("native:shell:open-path", (request) => openPath(request?.path));
    events.on<{ path: string }>("native:shell:reveal-path", (request) => revealPath(request?.path));
    events.on<{ path: string }>("native:shell:trash", (request) => trashPath(request?.path));
  },
  openExternal,
  openPath,
  revealPath,
  trash: trashPath,
};

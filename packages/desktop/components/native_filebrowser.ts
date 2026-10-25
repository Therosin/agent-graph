import { dirname, join } from "node:path";
import * as dialogs from "nativefiledialog-for-bun";
import type { NativeFileDialogOptions, NativeSaveFileOptions } from "shared/native-filebrowser";
import type { DesktopEvents } from "../events";

// Set this before the package initializes its backend. Development uses the
// installed package's library; a compiled app uses its target's staged library.
if (Bun.isStandaloneExecutable)
  dialogs.setLibraryPath(join(dirname(process.execPath), "native", "dialogs", process.platform, process.arch));

function parseOptions(value: unknown, save = false): NativeSaveFileOptions {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("File dialog options must be an object");
  const input = value as Record<string, unknown>;
  const options: NativeSaveFileOptions = {};
  for (const key of ["title", "defaultPath", ...(save ? ["defaultName"] : [])] as const) {
    const field = input[key];
    if (field === undefined) continue;
    if (typeof field !== "string" || field.includes("\0"))
      throw new Error(`File dialog ${key} must be a string without null characters`);
    Object.assign(options, { [key]: field });
  }
  if (input.filters !== undefined) {
    if (!Array.isArray(input.filters)) throw new Error("File dialog filters must be an array");
    options.filters = input.filters.map((filter: unknown) => {
      if (!filter || typeof filter !== "object") throw new Error("Invalid file dialog filter");
      const { name, extensions } = filter as Record<string, unknown>;
      if (typeof name !== "string" || !name.trim() || /[\0|]/.test(name))
        throw new Error("File filter names must be non-empty strings without pipes or null characters");
      if (!Array.isArray(extensions) || !extensions.length || extensions.some((extension) =>
        typeof extension !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(extension)))
        throw new Error("File filter extensions must be names such as txt or png, without dots at the start or wildcards");
      return { name, extensions: extensions as string[] };
    });
  }
  return options;
}

async function openFile(options: NativeFileDialogOptions = {}): Promise<string | null> {
  return dialogs.openFile(parseOptions(options));
}

async function openFiles(options: NativeFileDialogOptions = {}): Promise<string[] | null> {
  return dialogs.openFiles(parseOptions(options));
}

async function pickFolder(options: NativeFileDialogOptions = {}): Promise<string | null> {
  return dialogs.pickFolder(parseOptions(options));
}

async function pickFolders(options: NativeFileDialogOptions = {}): Promise<string[] | null> {
  return dialogs.pickFolders(parseOptions(options));
}

async function saveFile(options: NativeSaveFileOptions = {}): Promise<string | null> {
  return dialogs.saveFile(parseOptions(options, true));
}

export default {
  register(events: DesktopEvents): void {
    events.on("native:dialog:open-file", openFile);
    events.on("native:dialog:open-files", openFiles);
    events.on("native:dialog:pick-folder", pickFolder);
    events.on("native:dialog:pick-folders", pickFolders);
    events.on("native:dialog:save-file", saveFile);
  },

  openFile,
  openFiles,
  pickFolder,
  pickFolders,
  saveFile,
  backend: () => dialogs.getBackendName(),
};

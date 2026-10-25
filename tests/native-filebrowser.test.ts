import { afterEach, expect, spyOn, test } from "bun:test";
import { fileURLToPath } from "node:url";
import filebrowser from "../packages/desktop/components/native_filebrowser";
import { DesktopEvents } from "../packages/desktop/events";

const dialogs: typeof import("nativefiledialog-for-bun") = await import(
  Bun.resolveSync("nativefiledialog-for-bun", fileURLToPath(new URL("../packages/desktop/", import.meta.url))),
);

const mocks: { mockRestore(): void }[] = [];
afterEach(() => { mocks.splice(0).forEach((mock) => mock.mockRestore()); });

test("registered file dialog requests preserve options and return paths and cancellation over JSON", async () => {
  const open = spyOn(dialogs, "openFile").mockResolvedValue("C:\\Example\\notes.txt");
  const multiple = spyOn(dialogs, "openFiles").mockResolvedValue(["C:\\one.txt", "C:\\two.txt"]);
  const folder = spyOn(dialogs, "pickFolder").mockResolvedValue(null);
  const folders = spyOn(dialogs, "pickFolders").mockResolvedValue(["C:\\Example"]);
  const save = spyOn(dialogs, "saveFile").mockResolvedValue("C:\\Example\\export.json");
  mocks.push(open, multiple, folder, folders, save);
  const events = new DesktopEvents();
  expect(filebrowser.register(events)).toBeUndefined();
  const options = { defaultPath: "C:\\Example", filters: [{ name: "Text", extensions: ["txt", "md"] }] };
  const request = async (type: string, data?: unknown) => JSON.parse(await events.receive(JSON.stringify({ type, data })));
  expect(await request("native:dialog:open-file", options)).toEqual({ ok: true, data: "C:\\Example\\notes.txt" });
  expect(open).toHaveBeenCalledWith(options);
  expect(await request("native:dialog:open-files")).toEqual({ ok: true, data: ["C:\\one.txt", "C:\\two.txt"] });
  expect(await request("native:dialog:pick-folder", null)).toEqual({ ok: true, data: null });
  expect(await request("native:dialog:pick-folders")).toEqual({ ok: true, data: ["C:\\Example"] });
  expect(await request("native:dialog:save-file", { defaultName: "export.json" })).toEqual({ ok: true, data: "C:\\Example\\export.json" });
  expect(save).toHaveBeenCalledWith({ defaultName: "export.json" });
});

test("invalid file dialog options are rejected before entering native code", async () => {
  const open = spyOn(dialogs, "openFile").mockResolvedValue(null);
  mocks.push(open);
  for (const input of ["text", { defaultPath: 1 }, { title: "\0" },
    { filters: "Text" }, { filters: [{ name: "Text", extensions: ["*.txt"] }] },
    { filters: [{ name: "Text", extensions: [] }] },
  ]) await expect(filebrowser.openFile(input as never)).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});

test("native file dialog errors reject the desktop event rather than returning cancellation", async () => {
  const open = spyOn(dialogs, "openFile").mockRejectedValue(new Error("Native dialog failed"));
  mocks.push(open);
  const events = new DesktopEvents();
  filebrowser.register(events);
  expect(JSON.parse(await events.receive(JSON.stringify({ type: "native:dialog:open-file" }))))
    .toMatchObject({ ok: false, error: { message: "Native dialog failed" } });
});

import { afterEach, expect, test } from "bun:test";
import { isAbsolute, parse } from "node:path";
import { AppConfig, TrayConfig } from "../packages/config/config";
import { DesktopEvents } from "../packages/desktop/events";
import paths from "../packages/desktop/components/native_paths";
import shell from "../packages/desktop/components/native_shell";
import clipboard from "../packages/desktop/components/native_clipboard";
import tray from "../packages/desktop/components/native_tray";

afterEach(() => {
  tray.destroy();
  tray.setTooltip(TrayConfig.defaults.tooltip);
  tray.setMenu(TrayConfig.defaults.menu);
});

test("native paths use application identity and resolve actual OS user folders", async () => {
  const events = new DesktopEvents();
  paths.register(events);
  const result = await events.emit<Record<string, string>>("native:paths:list");
  for (const value of Object.values(result)) expect(isAbsolute(value)).toBe(true);
  expect(result.data).toContain(AppConfig.id);
  expect(result.data).not.toContain(`${AppConfig.id}-nodejs`);
  expect(await events.emit("native:paths:get", { name: "downloads" })).toBe(result.downloads);
  await expect(events.emit("native:paths:get", { name: "__proto__" })).rejects.toThrow("Unknown native path");
});

test("native shell rejects unsupported schemes, relative paths, and filesystem roots", async () => {
  const events = new DesktopEvents();
  shell.register(events);
  await expect(events.emit("native:shell:open-external", { url: "javascript:alert(1)" })).rejects.toThrow("scheme");
  await expect(events.emit("native:shell:open-path", { path: "relative.txt" })).rejects.toThrow("absolute");
  await expect(events.emit("native:shell:reveal-path", { path: "\0" })).rejects.toThrow("null");
  await expect(events.emit("native:shell:trash", { path: parse(process.cwd()).root })).rejects.toThrow("root");
});

test("clipboard input is validated without modifying the system clipboard", async () => {
  const events = new DesktopEvents();
  clipboard.register(events);
  await expect(events.emit("native:clipboard:write", { text: 123 })).rejects.toThrow("string");
});

test("tray registration has app lifetime and validates dynamic menus before calling native code", async () => {
  const enabled = TrayConfig.defaults.enabled;
  TrayConfig.defaults.enabled = false;
  const events = new DesktopEvents();
  try {
    expect(tray.register(events, { windowHandle: () => null, quit() {} })).toBeUndefined();
    expect(await events.emit("native:tray:status")).toMatchObject({ available: false, visible: false });
    await expect(events.emit("native:tray:set-menu", { menu: [
      { id: "duplicate", label: "First" }, { id: "duplicate", label: "Second" },
    ] })).rejects.toThrow("Duplicate");
    expect(() => tray.setTooltip("x".repeat(128))).toThrow("127");
    expect(() => tray.setMenu([{ id: "bad", label: "Bad", checked: "yes" }] as never)).toThrow("boolean");
    expect(() => tray.hideWindow()).toThrow("working tray host");
    expect(tray.setMenu([{ id: "test", label: "Test", items: [{ id: "child", label: "Child", checked: true }] }])).toMatchObject({ available: false });
    expect(tray.setTooltip("Application status").tooltip).toBe("Application status");
  } finally { TrayConfig.defaults.enabled = enabled; }
});

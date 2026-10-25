import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dlopen, JSCallback, ptr, type Pointer } from "bun:ffi";
import { AppConfig, TrayConfig } from "config";
import type { NativeTrayEntry, NativeTrayStatus } from "shared/native-tray";
import type { DesktopEvents } from "../events";

interface TrayHost {
  windowHandle(): number | bigint | null;
  quit(): void;
  onAction?(id: string): void;
}

interface TrayBackend {
  sync(): void;
  pump(): void;
  connected(): boolean;
  windowVisible(): boolean;
  showWindow(visible: boolean): void;
  destroy(): void;
}

let host: TrayHost | undefined;
let backend: TrayBackend | undefined;
let error: string | null = null;
let tooltip = TrayConfig.defaults.tooltip;
const configuredIcon = process.platform === "win32" ? TrayConfig.icons.win32 : process.platform === "linux" ? TrayConfig.icons.linux : "";
const iconIsFile = Boolean(configuredIcon) && (process.platform === "win32" || /[\\/]/.test(configuredIcon));
let icon = iconIsFile
  ? Bun.isStandaloneExecutable
    ? join(dirname(process.execPath), "native", "tray", process.platform, "icon" + extname(configuredIcon))
    : resolve(fileURLToPath(new URL("../../..", import.meta.url)), configuredIcon)
  : configuredIcon;
let active = true;
let menu = parseMenu(TrayConfig.defaults.menu);
const pending: string[] = [];
const listeners = new Set<(id: string) => void>();
// Registered GTK types retain code pointers for the life of the process.
const processLibraries: unknown[] = [];

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error(`Tray ${name} must be a non-empty string`);
  return value;
}

function parseMenu(value: unknown, ids = new Set<string>(), depth = 0): NativeTrayEntry[] {
  if (!Array.isArray(value) || value.length > 100 || depth > 8) throw new Error("Invalid tray menu");
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid tray menu item");
    const item = entry as Record<string, unknown>;
    if (item.separator === true) return { separator: true };
    const id = text(item.id, "item id");
    if (ids.has(id)) throw new Error(`Duplicate tray item id: ${id}`);
    ids.add(id);
    for (const flag of ["enabled", "checked"]) if (item[flag] !== undefined && typeof item[flag] !== "boolean") throw new Error(`Tray ${flag} must be a boolean`);
    return {
      id, label: text(item.label, "item label"),
      ...(item.enabled === undefined ? {} : { enabled: item.enabled as boolean }),
      ...(item.checked === undefined ? {} : { checked: item.checked as boolean }),
      ...(item.items === undefined ? {} : { items: parseMenu(item.items, ids, depth + 1) }),
    };
  });
}

function windowHandle(): Pointer {
  const handle = host?.windowHandle();
  if (!handle) throw new Error("The application window is not ready");
  return Number(handle) as Pointer;
}

function windowsBackend(): TrayBackend {
  const user = dlopen("user32.dll", {
    RegisterClassExW: { args: ["buffer"], returns: "u16" },
    UnregisterClassW: { args: ["buffer", "ptr"], returns: "bool" },
    CreateWindowExW: { args: ["u32", "buffer", "ptr", "u32", "i32", "i32", "i32", "i32", "ptr", "ptr", "ptr", "ptr"], returns: "ptr" },
    DefWindowProcW: { args: ["ptr", "u32", "u64", "i64"], returns: "i64" },
    DestroyWindow: { args: ["ptr"], returns: "bool" },
    PeekMessageW: { args: ["buffer", "ptr", "u32", "u32", "u32"], returns: "bool" },
    TranslateMessage: { args: ["buffer"], returns: "bool" },
    DispatchMessageW: { args: ["buffer"], returns: "i64" },
    RegisterWindowMessageW: { args: ["buffer"], returns: "u32" },
    LoadIconW: { args: ["ptr", "ptr"], returns: "ptr" },
    LoadImageW: { args: ["ptr", "buffer", "u32", "i32", "i32", "u32"], returns: "ptr" },
    DestroyIcon: { args: ["ptr"], returns: "bool" },
    CreatePopupMenu: { args: [], returns: "ptr" },
    AppendMenuW: { args: ["ptr", "u32", "u64", "ptr"], returns: "bool" },
    DestroyMenu: { args: ["ptr"], returns: "bool" },
    GetCursorPos: { args: ["buffer"], returns: "bool" },
    TrackPopupMenu: { args: ["ptr", "u32", "i32", "i32", "i32", "ptr", "ptr"], returns: "u32" },
    PostMessageW: { args: ["ptr", "u32", "u64", "i64"], returns: "bool" },
    ShowWindow: { args: ["ptr", "i32"], returns: "bool" },
    IsWindowVisible: { args: ["ptr"], returns: "bool" },
    IsZoomed: { args: ["ptr"], returns: "bool" },
    SetForegroundWindow: { args: ["ptr"], returns: "bool" },
  });
  const shell = dlopen("shell32.dll", { Shell_NotifyIconW: { args: ["u32", "buffer"], returns: "bool" } });
  const kernel = dlopen("kernel32.dll", {
    GetModuleHandleW: { args: ["ptr"], returns: "ptr" },
    GetLastError: { args: [], returns: "u32" },
  });
  const win = user.symbols;
  const notify = Buffer.alloc(976);
  const message = Buffer.alloc(48);
  const className = Buffer.from(`AstroDesktopTray.${AppConfig.id}.${process.pid}\0`, "utf16le");
  const instance = kernel.symbols.GetModuleHandleW(null);
  const windowClass = Buffer.alloc(80);
  const ids = new Map<number, string>();
  let popup: Pointer | null = null;
  let ownedIcon: Pointer | null = null;
  let taskbarReset = false;
  let wasMaximized = false;
  let registered = false;
  const taskbarMessage = win.RegisterWindowMessageW(Buffer.from("TaskbarCreated\0", "utf16le"));
  const callback = new JSCallback((handle, code, wparam, lparam) => {
    if (code === taskbarMessage) taskbarReset = true;
    if (code === 0x8010) {
      if (Number(lparam) === 0x0202) pending.push("show");
      if (Number(lparam) === 0x0205 && popup) {
        const point = Buffer.alloc(8);
        win.GetCursorPos(point);
        win.SetForegroundWindow(handle);
        const selected = win.TrackPopupMenu(popup, 0x0100 | 0x0002, point.readInt32LE(0), point.readInt32LE(4), 0, handle, null);
        if (ids.has(selected)) pending.push(ids.get(selected)!);
        win.PostMessageW(handle, 0, 0, 0);
      }
      return 0n;
    }
    return win.DefWindowProcW(handle, code, wparam, lparam);
  }, { args: ["ptr", "u32", "u64", "i64"], returns: "i64" });
  windowClass.writeUInt32LE(80);
  windowClass.writeBigUInt64LE(BigInt(callback.ptr!), 8);
  windowClass.writeBigUInt64LE(BigInt(instance || 0), 24);
  windowClass.writeBigUInt64LE(BigInt(ptr(className)), 64);
  if (!win.RegisterClassExW(windowClass)) throw new Error(`Could not register tray window (${kernel.symbols.GetLastError()})`);
  const handle = win.CreateWindowExW(0, className, null, 0, 0, 0, 0, 0, null, null, instance, null);
  if (!handle) { win.UnregisterClassW(className, instance); callback.close(); throw new Error("Could not create tray window"); }
  notify.writeUInt32LE(976);
  notify.writeBigUInt64LE(BigInt(handle), 8);
  notify.writeUInt32LE(1, 16);
  notify.writeUInt32LE(7, 20);
  notify.writeUInt32LE(0x8010, 24);

  function buildMenu(entries: NativeTrayEntry[], next = { id: 1000 }): Pointer {
    const result = win.CreatePopupMenu();
    if (!result) throw new Error("Could not create tray menu");
    for (const entry of entries) {
      if ("separator" in entry) win.AppendMenuW(result, 0x0800, 0, null);
      else {
        const label = Buffer.from(entry.label + "\0", "utf16le");
        let flags = (entry.enabled === false ? 0x0003 : 0) | (entry.checked ? 0x0008 : 0);
        let item = next.id++;
        if (entry.items) { flags |= 0x0010; item = buildMenu(entry.items, next); }
        else ids.set(item, entry.id);
        win.AppendMenuW(result, flags, item, ptr(label));
      }
    }
    return Number(result) as Pointer;
  }

  function sync() {
    const image = icon ? win.LoadImageW(null, Buffer.from(icon + "\0", "utf16le"), 1, 0, 0, 0x0010 | 0x0040) : win.LoadIconW(null, 32512 as Pointer);
    if (!image) throw new Error("Could not load tray icon; Windows expects an .ico file");
    const previousIcon = ownedIcon;
    ownedIcon = icon ? Number(image) as Pointer : null;
    notify.writeBigUInt64LE(BigInt(image), 32);
    notify.fill(0, 40, 296);
    Buffer.from(tooltip.slice(0, 127), "utf16le").copy(notify, 40);
    ids.clear();
    const previousMenu = popup;
    popup = buildMenu(menu);
    if (active) {
      if (!shell.symbols.Shell_NotifyIconW(registered ? 1 : 0, notify)) throw new Error(`Could not add or update tray icon (${kernel.symbols.GetLastError()})`);
      registered = true;
    } else if (registered) { shell.symbols.Shell_NotifyIconW(2, notify); registered = false; }
    if (previousMenu) win.DestroyMenu(previousMenu);
    if (previousIcon) win.DestroyIcon(previousIcon);
  }

  const result: TrayBackend = {
    sync,
    pump() {
      for (let count = 0; count < 64 && win.PeekMessageW(message, handle, 0, 0, 1); count++) {
        win.TranslateMessage(message);
        win.DispatchMessageW(message);
      }
      if (taskbarReset) { taskbarReset = false; registered = false; sync(); }
    },
    connected: () => true,
    windowVisible: () => { const value = host?.windowHandle(); return value ? win.IsWindowVisible(Number(value) as Pointer) : false; },
    showWindow(visible) {
      const value = windowHandle();
      if (!visible) wasMaximized = win.IsZoomed(value);
      win.ShowWindow(value, visible ? wasMaximized ? 3 : 9 : 0);
      if (visible) win.SetForegroundWindow(value);
    },
    destroy() {
      if (registered) shell.symbols.Shell_NotifyIconW(2, notify);
      if (popup) win.DestroyMenu(popup);
      if (ownedIcon) win.DestroyIcon(ownedIcon);
      win.DestroyWindow(handle);
      win.UnregisterClassW(className, instance);
      callback.close();
      user.close(); shell.close(); kernel.close();
    },
  };
  try { sync(); } catch (failure) { result.destroy(); throw failure; }
  return result;
}

function linuxBackend(): TrayBackend {
  const symbols = {
    app_indicator_new: { args: ["buffer", "buffer", "i32"], returns: "ptr" },
    app_indicator_set_status: { args: ["ptr", "i32"], returns: "void" },
    app_indicator_set_title: { args: ["ptr", "buffer"], returns: "void" },
    app_indicator_set_icon_full: { args: ["ptr", "buffer", "buffer"], returns: "void" },
    app_indicator_set_menu: { args: ["ptr", "ptr"], returns: "void" },
  } as const;
  let indicatorLibrary: ReturnType<typeof dlopen<typeof symbols>> | undefined;
  for (const name of ["libayatana-appindicator3.so.1", "libappindicator3.so.1"]) {
    try { indicatorLibrary = dlopen(name, symbols); break; } catch { /* Try the alternative provider. */ }
  }
  if (!indicatorLibrary) throw new Error("Install libayatana-appindicator3-1 to enable native Linux tray support");
  const gtk = dlopen("libgtk-3.so.0", {
    gtk_init_check: { args: ["ptr", "ptr"], returns: "bool" },
    gtk_menu_new: { args: [], returns: "ptr" },
    gtk_menu_item_new_with_label: { args: ["buffer"], returns: "ptr" },
    gtk_check_menu_item_new_with_label: { args: ["buffer"], returns: "ptr" },
    gtk_check_menu_item_set_active: { args: ["ptr", "bool"], returns: "void" },
    gtk_separator_menu_item_new: { args: [], returns: "ptr" },
    gtk_menu_shell_append: { args: ["ptr", "ptr"], returns: "void" },
    gtk_menu_item_set_submenu: { args: ["ptr", "ptr"], returns: "void" },
    gtk_widget_set_sensitive: { args: ["ptr", "bool"], returns: "void" },
    gtk_widget_show_all: { args: ["ptr"], returns: "void" },
    gtk_widget_hide: { args: ["ptr"], returns: "void" },
    gtk_widget_get_visible: { args: ["ptr"], returns: "bool" },
    gtk_widget_destroy: { args: ["ptr"], returns: "void" },
    gtk_window_present: { args: ["ptr"], returns: "void" },
    gtk_events_pending: { args: [], returns: "bool" },
    gtk_main_iteration_do: { args: ["bool"], returns: "bool" },
  });
  const objects = dlopen("libgobject-2.0.so.0", {
    g_signal_connect_data: { args: ["ptr", "buffer", "function", "ptr", "ptr", "u32"], returns: "u64" },
    g_object_ref_sink: { args: ["ptr"], returns: "ptr" },
    g_object_unref: { args: ["ptr"], returns: "void" },
    g_object_get: { args: ["ptr", "buffer", "buffer", "ptr"], returns: "void" },
  });
  processLibraries.push(indicatorLibrary, gtk, objects);
  if (!gtk.symbols.gtk_init_check(null, null)) throw new Error("Linux tray requires a graphical desktop session");
  const native = indicatorLibrary.symbols;
  const c = (value: string) => Buffer.from(value + "\0");
  const indicator = native.app_indicator_new(c(AppConfig.id), c(icon || TrayConfig.icons.linux), 0);
  if (!indicator) throw new Error("Could not create Linux tray indicator");
  let root: Pointer | null = null;
  let callbacks: JSCallback[] = [];

  function buildMenu(entries: NativeTrayEntry[]): Pointer {
    const result = gtk.symbols.gtk_menu_new();
    if (!result) throw new Error("Could not create Linux tray menu");
    for (const entry of entries) {
      if ("separator" in entry) {
        gtk.symbols.gtk_menu_shell_append(result, gtk.symbols.gtk_separator_menu_item_new());
        continue;
      }
      const item = entry.checked === undefined ? gtk.symbols.gtk_menu_item_new_with_label(c(entry.label)) : gtk.symbols.gtk_check_menu_item_new_with_label(c(entry.label));
      if (entry.checked !== undefined) gtk.symbols.gtk_check_menu_item_set_active(item, entry.checked);
      gtk.symbols.gtk_widget_set_sensitive(item, entry.enabled !== false);
      if (entry.items) gtk.symbols.gtk_menu_item_set_submenu(item, buildMenu(entry.items));
      else {
        const callback = new JSCallback(() => { pending.push(entry.id); }, { args: ["ptr", "ptr"], returns: "void" });
        callbacks.push(callback);
        objects.symbols.g_signal_connect_data(item, c("activate"), callback.ptr!, null, null, 0);
      }
      gtk.symbols.gtk_menu_shell_append(result, item);
    }
    return Number(result) as Pointer;
  }

  function sync() {
    const oldRoot = root;
    const oldCallbacks = callbacks;
    callbacks = [];
    root = buildMenu(menu);
    objects.symbols.g_object_ref_sink(root);
    gtk.symbols.gtk_widget_show_all(root);
    native.app_indicator_set_menu(indicator, root);
    native.app_indicator_set_title(indicator, c(tooltip));
    native.app_indicator_set_icon_full(indicator, c(icon || TrayConfig.icons.linux), c(tooltip));
    native.app_indicator_set_status(indicator, active ? 1 : 0);
    if (oldRoot) { gtk.symbols.gtk_widget_destroy(oldRoot); objects.symbols.g_object_unref(oldRoot); }
    oldCallbacks.forEach((callback) => callback.close());
  }

  sync();
  return {
    sync,
    pump() { for (let count = 0; count < 64 && gtk.symbols.gtk_events_pending(); count++) gtk.symbols.gtk_main_iteration_do(false); },
    connected() {
      const output = Buffer.alloc(4);
      objects.symbols.g_object_get(indicator, c("connected"), output, null);
      return Boolean(output.readInt32LE());
    },
    windowVisible() { const value = host?.windowHandle(); return value ? gtk.symbols.gtk_widget_get_visible(Number(value) as Pointer) : false; },
    showWindow(visible) {
      const value = windowHandle();
      if (visible) { gtk.symbols.gtk_widget_show_all(value); gtk.symbols.gtk_window_present(value); }
      else gtk.symbols.gtk_widget_hide(value);
    },
    destroy() {
      native.app_indicator_set_status(indicator, 0);
      objects.symbols.g_object_unref(indicator);
      if (root) { gtk.symbols.gtk_widget_destroy(root); objects.symbols.g_object_unref(root); }
      callbacks.forEach((callback) => callback.close());
    },
  };
}

function status(): NativeTrayStatus {
  const supported = process.platform === "win32" || process.platform === "linux";
  const connected = backend?.connected() ?? false;
  return {
    supported, available: Boolean(backend), hostAvailable: connected,
    visible: Boolean(backend) && active && connected,
    windowVisible: backend?.windowVisible() ?? false,
    tooltip, icon, error,
  };
}

function create(): NativeTrayStatus {
  if (backend) return status();
  try {
    if (process.platform === "win32") backend = windowsBackend();
    else if (process.platform === "linux") backend = linuxBackend();
    else throw new Error("Native tray is currently implemented for Windows and Linux");
    error = null;
  } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  return status();
}

function setTooltip(value: string): NativeTrayStatus {
  text(value, "tooltip");
  if (value.length > 127) throw new Error("Tray tooltip is limited to 127 characters");
  tooltip = value;
  backend?.sync();
  return status();
}

function setMenu(value: readonly NativeTrayEntry[] | typeof TrayConfig.defaults.menu): NativeTrayStatus {
  menu = parseMenu(value);
  backend?.sync();
  return status();
}

function setIcon(value: string): NativeTrayStatus {
  if (typeof value !== "string" || value.includes("\0")) throw new Error("Tray icon must be a string");
  if (value && process.platform === "win32" && !isAbsolute(value)) throw new Error("Windows tray icons must use an absolute .ico path");
  icon = value;
  backend?.sync();
  return status();
}

function showWindow(): void {
  if (!backend) throw new Error(error || "Native tray is unavailable");
  backend.showWindow(true);
}

function hideWindow(): void {
  if (!backend || !backend.connected() || !active) throw new Error("A working tray host is required before hiding the window");
  backend.showWindow(false);
}

export default {
  register(events: DesktopEvents, context: TrayHost): void {
    host = context;
    events.on("native:tray:status", status);
    events.on<{ tooltip: string }>("native:tray:set-tooltip", (request) => setTooltip(request?.tooltip));
    events.on<{ icon: string }>("native:tray:set-icon", (request) => setIcon(request?.icon));
    events.on<{ menu: NativeTrayEntry[] }>("native:tray:set-menu", (request) => setMenu(request?.menu));
    events.on("native:tray:show-window", showWindow);
    events.on("native:tray:hide-window", hideWindow);
    if (TrayConfig.defaults.enabled) create();
  },
  create,
  status,
  setTooltip,
  setIcon,
  setMenu,
  showWindow,
  hideWindow,
  show() { active = true; create(); backend?.sync(); return status(); },
  hide() {
    if (backend && !backend.windowVisible()) throw new Error("Show the window before hiding its tray icon");
    active = false; backend?.sync(); return status();
  },
  onAction(handler: (id: string) => void): void { listeners.add(handler); },
  update(): void {
    backend?.pump();
    for (const id of pending.splice(0)) {
      try {
        if (id === "show") showWindow();
        else if (id === "hide") hideWindow();
        else if (id === "quit") host?.quit();
        host?.onAction?.(id);
        listeners.forEach((handler) => handler(id));
      } catch (failure) { console.error("Tray action failed:", failure); }
    }
  },
  destroy(): void { backend?.destroy(); backend = undefined; pending.length = 0; },
};

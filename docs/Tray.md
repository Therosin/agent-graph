# The system tray

The tray gives the application a place to remain accessible while its window is hidden. The starter provides Show window, Hide window, and Quit actions, and leaves ordinary window closing as a normal app exit.

The host already registers [native_tray.ts](../packages/desktop/components/native_tray.ts). It uses native Windows tray/menu APIs and Linux AppIndicator/GTK through Bun FFI.

## Set the initial menu and icon

Edit the existing `TrayConfig` in [config.ts](../packages/config/config.ts):

```ts
export const TrayConfig = {
  defaults: {
    enabled: true,
    tooltip: APP_NAME,
    menu: [
      { id: "show", label: "Open Field Notes" },
      { id: "hide", label: "Hide window" },
      { separator: true },
      { id: "quit", label: "Quit" },
    ],
  },
  icons: {
    win32: "./assets/tray.ico",
    linux: "./assets/tray.png",
  },
};
```

Add those files at the repository-relative paths you choose. The build stages configured icon files beside the executable under `native/tray/<platform>`. Linux can instead use a theme name such as the starter's `application-x-executable`; that needs no bundled icon file. An empty Windows icon setting uses a generic system icon.

Set `enabled: false` if your app does not need a tray. Menu ids are unique. The ids `show`, `hide`, and `quit` are the built-in window actions; changing their labels does not change their behavior.

## Add application actions

For runtime menus, use the component from `packages/desktop/main.ts` or another desktop module with the appropriate import path:

```ts
import tray from "./components/native_tray";

tray.setMenu([
  { id: "show", label: "Show window" },
  { id: "sync", label: "Sync now" },
  { id: "options", label: "Options", items: [
    { id: "background", label: "Background work", checked: true },
  ] },
  { separator: true },
  { id: "quit", label: "Quit" },
]);
tray.onAction((id) => {
  if (id === "sync") { /* Start your application's sync operation. */ }
});
```

Register app action listeners during startup. Items support `enabled`, `checked`, and nested `items`, as well as separators. Checked state belongs to your menu data: update it with `setMenu()` when your application toggles an option. Use `tray.setTooltip(text)` and `tray.setIcon(icon)` for status changes; runtime file icon paths should be absolute. Tooltips are limited to 127 characters.

The desktop also emits `desktop:tray-action` into the current page with `{ id }` as its detail. A store can listen with `onDesktopEvent<{ id: string }>(...)` if an action affects frontend state. Use desktop/backend code for work that must still happen while no page listener is available.

## Hide the existing window

A frontend action can request:

```ts
import { sendEvent } from "../desktop/events";
import type { NativeTrayStatus } from "shared/native-tray";

const tray = await sendEvent<NativeTrayStatus>("native:tray:status");
if (tray.visible) await sendEvent("native:tray:hide-window");
```

Use this in a client action and report rejected requests in your UI. Showing/hiding preserves the existing WebView and its state. It does not navigate or recreate the document. On Windows, left-clicking the tray icon restores the window; its context menu also provides the window actions. On Linux, use the tray menu.

The host rejects hiding without an active tray host. Closing the window still quits. If you later design a close-to-tray policy, implement that deliberately in your application's lifecycle rather than assuming hiding and closing are interchangeable.

## Use the frontend API

| Request | Payload |
| --- | --- |
| `native:tray:status` | None; returns `NativeTrayStatus`. |
| `native:tray:set-tooltip` | `{ tooltip }` |
| `native:tray:set-icon` | `{ icon }` |
| `native:tray:set-menu` | `{ menu }` |
| `native:tray:show-window` | None. |
| `native:tray:hide-window` | None. |

Desktop code also has `create`, `show`, `hide`, `showWindow`, `hideWindow`, and `status` helpers. `show`/`hide` affect the tray icon; `showWindow`/`hideWindow` affect the WebView. The host already pumps tray events and destroys its native resources during shutdown.

## Check Linux availability

Linux needs `libayatana-appindicator3-1` or a compatible AppIndicator library and a graphical session with a supporting tray host. Installing a library alone does not create a desktop panel. WSLg by itself has no tray panel.

`status.available` means the native backend loaded. `status.hostAvailable` means a tray host is connected, and `status.visible` indicates the icon is active with that host. Use `status.error` when creation fails. [NativeDesktopDemo.vue](../packages/astro/src/components/NativeDesktopDemo.vue) demonstrates presenting this state and disabling its hide button when needed.

[Documentation home](README.md) · [Notifications](Notifications.md) · [Packaging](Packaging.md)

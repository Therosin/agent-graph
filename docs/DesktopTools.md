# Clipboard, folders, and opening things

The template includes small native helpers for common desktop actions. Use them to compose your own workflows: choose a save location, reveal an export, copy a result, or open a help link. They are already registered and callable through `sendEvent`.

Examples below are client-side actions or store code under `src`, using:

```ts
import { sendEvent } from "../desktop/events";
```

Vue can use the same calls through `this.$sendEvent` or `useDesktopEvents()`. Catch failures in the action's UI. [NativeDesktopDemo.vue](../packages/astro/src/components/NativeDesktopDemo.vue) contains working clipboard, folder, and tray buttons.

## Copy and paste text

```ts
await sendEvent("native:clipboard:write", { text: "Copied from Field Notes" });
const text = await sendEvent<string>("native:clipboard:read");
```

Clipboard support is text-only. Writing an empty string is allowed. Use it in an explicit copy/paste action so the app changes the clipboard when the user expects it.

Windows uses `clipboardy`. Linux uses `wl-copy`/`wl-paste` in a Wayland session and `xsel` on X11; install `wl-clipboard` or `xsel` as appropriate. A Linux app under WSL uses the Linux clipboard backend. Clipboard access requires a graphical session.

## Find application and user folders

```ts
import type { NativePaths } from "shared/native-paths";

const folders = await sendEvent<NativePaths>("native:paths:list");
const downloads = await sendEvent<string>("native:paths:get", {
  name: "downloads",
});
```

The returned names are:

| Kind | Names |
| --- | --- |
| Application directories | `data`, `config`, `cache`, `log`, `temp` |
| User directories | `home`, `documents`, `downloads`, `desktop` |

Application paths use `AppConfig.id`. Windows user paths come from Known Folders, so redirected folders are respected. Linux reads XDG user directories. A returned path does not create the directory; let the service that writes there create it when needed.

For example, use `folders.data` for your app's durable records and `folders.cache` for replaceable generated data. A native component in the desktop process can resolve the same values directly:

```ts
import paths from "./components/native_paths";

const { data, cache } = paths.app();
const documents = paths.get("documents");
```

This import is relative to `packages/desktop/main.ts`. Backend services should receive or resolve their storage paths in Bun code; importing the FFI-based desktop component into browser code is not needed.

## Open a URL, file, or folder

```ts
await sendEvent("native:shell:open-external", {
  url: "https://example.com/help",
});
await sendEvent("native:shell:open-path", { path: downloads });
```

External URLs use the system handler. The allowed schemes start as HTTP, HTTPS, and mailto; edit `ShellConfig.defaults.allowedSchemes` in config if your app needs another scheme. Local paths must be absolute and exist. `open-path` uses the associated application or file manager. Opening acknowledges launching the handler, rather than waiting until that application closes.

To select an existing export in the file manager:

```ts
await sendEvent("native:shell:reveal-path", { path: exportedPath });
```

Here `exportedPath` is the absolute path returned by your export operation. On Linux, revealing requires a file manager that provides the `org.freedesktop.FileManager1` D-Bus interface. A minimal WSLg installation may have no file manager or default application associations even though its WebView works.

## Move an item to Trash

When your app offers a delete action with the user's intent established:

```ts
await sendEvent("native:shell:trash", { path: selectedPath });
```

`selectedPath` must be an existing absolute path. The helper uses Windows Recycle Bin or Linux GIO Trash; it does not fall back to permanent deletion. Filesystem roots are rejected. Let errors reach your UI rather than assuming every volume supports recycling.

The desktop [shell component](../packages/desktop/components/native_shell.ts) also exposes direct `openExternal`, `openPath`, `revealPath`, and `trash` methods, following the same default component API as the other native tools.

[Documentation home](README.md) · [File dialogs](FileDialogs.md) · [Desktop events](DesktopEvents.md)

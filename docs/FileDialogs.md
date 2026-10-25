# Native file and folder dialogs

Use a native dialog when the user should choose a document, destination, or folder. The file-browser component is already registered by the desktop host, so your frontend only needs to make a request.

The implementation is [native_filebrowser.ts](../packages/desktop/components/native_filebrowser.ts), using [nativefiledialog-for-bun](https://github.com/Catharacta/nativefiledialog-for-bun). [NativeFileDialogDemo.vue](../packages/astro/src/components/NativeFileDialogDemo.vue) shows every operation in a working island.

## Choose one document

In a store or client-side action under `src`, import the helper using the appropriate relative path:

```ts
import { sendEvent } from "../desktop/events";

export async function chooseDocument() {
  const path = await sendEvent<string | null>("native:dialog:open-file", {
    title: "Open a document",
    filters: [{ name: "Text documents", extensions: ["txt", "md"] }],
  });
  if (path === null) return;
  // Hand this path to your application's document-loading action.
  return path;
}
```

Invoke the action from a button and catch errors in your UI. Cancelling is a normal result, represented by `null`; a native failure rejects the promise. In Vue Options API methods, `this.$sendEvent` accepts the same arguments. Composition API components can use `useDesktopEvents()` as shown in [Desktop events](DesktopEvents.md).

## Choose a destination

A save dialog asks for a path; it does not create or write a file:

```ts
const destination = await sendEvent<string | null>("native:dialog:save-file", {
  title: "Export your notes",
  defaultName: "notes.txt",
  filters: [{ name: "Text", extensions: ["txt"] }],
});
if (destination !== null) {
  // Ask your backend or a native handler to perform the export here.
}
```

Use a backend API action or your own desktop handler to read/write the selected path. An Astro or Vue component runs inside the WebView and cannot use Bun filesystem APIs directly.

## Pick the operation you need

| Event | Returned value |
| --- | --- |
| `native:dialog:open-file` | `string` or `null` |
| `native:dialog:open-files` | `string[]` or `null` |
| `native:dialog:pick-folder` | `string` or `null` |
| `native:dialog:pick-folders` | `string[]` or `null` |
| `native:dialog:save-file` | `string` or `null` |

All accept optional `title`, `defaultPath`, and `filters` where the backend supports them. Save dialogs additionally accept `defaultName`. Filter extensions are bare names such as `png`, without a leading dot or wildcard. Omit filters when any file type is acceptable.

For a starting directory, resolve an actual user folder rather than assembling a platform-specific home path yourself:

```ts
const defaultPath = await sendEvent<string>("native:paths:get", {
  name: "documents",
});
const paths = await sendEvent<string[] | null>("native:dialog:open-files", {
  defaultPath,
});
```

## Call from desktop code

Code running in the desktop host can use the component directly:

```ts
import filebrowser from "./components/native_filebrowser";

const path = await filebrowser.openFile();
```

This import is relative to `packages/desktop/main.ts`. The corresponding helper methods are `openFiles`, `pickFolder`, `pickFolders`, and `saveFile`; registration is already done at startup.

The provider prefers its FFI backend and can fall back to platform scripts. Fallback features vary, so test the selection modes you rely on. Its Promise API wraps synchronous FFI dialog calls: desktop JavaScript waits while the native dialog is open. Packaged builds need the target dialog library beside the executable; [Packaging](Packaging.md) explains which directories to ship.

[Documentation home](README.md) · [Desktop tools](DesktopTools.md) · [Desktop events](DesktopEvents.md)

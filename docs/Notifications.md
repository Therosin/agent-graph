# Native notifications

Use a toast when something outside the current screen deserves the user's attention: an export finishes, a task fails, or work completes while the window is hidden. The template already registers [native_toast.ts](../packages/desktop/components/native_toast.ts), backed by [toasted-notifier](https://github.com/Aetherinox/node-toasted-notifier).

## Show a simple notification

From a client-side store or action:

```ts
import { sendEvent } from "../desktop/events";
import type { NativeToastResult } from "shared/native-toast";

export async function notifyExportReady() {
  return await sendEvent<NativeToastResult>("native:toast", {
    message: "Your notes have been exported.",
  });
}
```

The title defaults to `AppConfig.appName`. Set a different `title` in an individual request when it helps explain the notification. Sound and timeout defaults live in `ToastConfig.defaults` in [config.ts](../packages/config/config.ts); a request can override them with `sound` and `timeout`. Timeouts are in seconds, and the operating system may round the duration.

The promise resolves with the native result, so call it in an async action and handle failures in your interface. A notification can take time to be dismissed or acted on.

## Offer an action when available

Check the provider's capabilities before including buttons:

```ts
import type {
  NativeToastCapabilities, NativeToastResult,
} from "shared/native-toast";

const capabilities = await sendEvent<NativeToastCapabilities>(
  "native:toast:capabilities",
);
const result = await sendEvent<NativeToastResult>("native:toast", {
  message: "Your export is ready.",
  ...(capabilities.actions ? {
    actions: [{ id: "open-export", label: "Open export" }],
  } : {}),
});

if (result.event === "action" && result.action === "open-export") {
  // Run your application's action to open the exported file.
}
```

Use stable action ids for application behavior; button labels are presentation. Results contain an `event` value (`action`, `click`, `dismissed`, `timeout`, `sent`, or `unknown`) and an action id or `null`. Concurrent requests resolve independently.

The Windows provider supports actions. This template's Linux provider hands the notification to system `notify-send`: it returns `sent` after successful handoff, does not await a click, and rejects requests containing actions. A desktop notification server is needed in addition to the `notify-send` command. [Getting started](GettingStarted.md) and [Packaging](Packaging.md#run-on-ubuntu-or-wslg) cover the Linux setup.

## Brand and test your notifications

Windows notification header branding uses an AppUserModelID registered by your installer, which is separate from the toast title. Once your installer registers one, put it in `ToastConfig.windowsAppId`. Leaving the value empty uses the provider's default identity.

Notification appearance and visibility belong to the operating system. If the native action returns but nothing appears, check notification permissions and Do Not Disturb before changing your application code.

[NativeToastDemo.vue](../packages/astro/src/components/NativeToastDemo.vue) includes plain and action-button examples. Native checks can exercise the provider, but checking your chosen text, branding, and interactions on each target desktop is still part of designing the app.

## Call from the desktop host

Desktop code can use the same feature without a frontend request:

```ts
import toasts from "./components/native_toast";

await toasts.show({ message: "Your background task finished." });
```

This import is relative to `packages/desktop/main.ts`. The host registers the component once; the helper uses the same options and results. Windows packages also need the notification helper directory shipped beside the executable, as described in [Packaging](Packaging.md).

[Documentation home](README.md) · [System tray](Tray.md) · [Desktop events](DesktopEvents.md)

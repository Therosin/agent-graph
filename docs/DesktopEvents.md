# Desktop requests and pushed events

Use the desktop bridge when a page needs a native capability, or when the backend has something to tell the current page. Both directions carry ordinary JavaScript values encoded as JSON. Application HTTP routes remain available for your normal data operations.

## Await a native operation

Astro client scripts and stores can import `sendEvent` from `src/desktop/events.ts`. In a module under `src/stores`, for example:

```ts
import { sendEvent } from "../desktop/events";

export async function chooseDocument() {
  return await sendEvent<string | null>("native:dialog:open-file", {
    filters: [{ name: "Documents", extensions: ["md", "txt"] }],
  });
}
```

The promise resolves with the handler's result. A cancelled file dialog returns `null`; an error rejects the promise. Call the action from a button or other client-side interaction, and catch failures where your UI can show them.

Vue's app entrypoint makes the same function available as `this.$sendEvent` in Options API components. In `<script setup>`, use the injected helper:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useDesktopEvents } from "../vue/desktop";
const sendEvent = useDesktopEvents();
const message = ref("");

async function choose() {
  try {
    const path = await sendEvent<string | null>("native:dialog:open-file");
    message.value = path ?? "No file selected";
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <button type="button" class="button" @click="choose">Choose document</button>
  <p role="status">{{ message }}</p>
</template>
```

Calls require a connected desktop host. Browser preview can render your interface and use HTTP, but a native request rejects there. Check `$desktopConnection` from `stores/AppSettings` to disable native-only actions, as the supplied demo components do.

There is no default request timeout: a user may leave a file picker open. An optional third argument, `{ timeoutMs: 5000 }`, limits how long the caller waits; it does not cancel the underlying native operation.

## Add your own native handler

Register a handler with the `events` instance in [desktop/main.ts](../packages/desktop/main.ts), alongside the existing registrations. For example, `AppConfig` is already available there:

```ts
events.on("native:app-version", () => ({
  name: AppConfig.appName,
  version: AppConfig.appVersion,
}));
```

The frontend can await `sendEvent<{ name: string; version: string }>("native:app-version")`. A handler can be async and await a native operation before returning. Objects are encoded and decoded automatically, and thrown errors reach the caller as rejected promises.

Each request name has one result-producing handler. For a reusable native feature, follow the existing `native_*.ts` component convention: keep its implementation in that file, default-export an object with `register(events, ...context): void`, and add helper methods on the same object. Register it once at startup for the life of the app. Libraries and direct Bun FFI can both be used inside it.

## Push updates from the backend

Sometimes the backend already knows that something changed. In the worker branch of [backend/main.ts](../packages/backend/main.ts), use its existing `parent` channel:

```ts
await parent.Emit("window:dispatch", {
  name: "task:progress",
  detail: { id: "example", percent: 67 },
});
```

The desktop forwards that as a `CustomEvent` on the current page's `window`. Names must be non-empty strings, and detail must be JSON-serializable. Detail is optional and becomes `null` when omitted. This uses the existing WorkerRPC and WebUI connections.

For a small live value, let a store consume it directly. A store under `src/stores` can use:

```ts
import { atom, onMount } from "nanostores";
import { onDesktopEvent } from "../desktop/events";

export const $taskProgress = atom(0);
onMount($taskProgress, () =>
  onDesktopEvent<{ id: string; percent: number }>("task:progress", (detail) => {
    $taskProgress.set(detail.percent);
  }),
);
```

Any subscribed Vue island can bind to `$taskProgress` with `useStore`. `onMount` shares one listener across consumers and removes it when the store becomes inactive. `onDesktopEvent` is safe to import during SSR; registering without a browser is a no-op. Ordinary `window.addEventListener` also works if you prefer to receive the full CustomEvent.

## Signal an HTTP refresh instead

When a collection or record changes, an event can carry just the signal or identifier and leave the data fetch to your existing API action:

```ts
// Backend worker, after changing project data:
await parent.Emit("window:dispatch", { name: "projects:changed" });
```

```ts
// In your frontend project's store, alongside its refreshProjects action:
onMount($projects, () =>
  onDesktopEvent("projects:changed", () => { void refreshProjects(); }),
);
```

Here `$projects` and `refreshProjects` are your application's store and HTTP action. The starter's [BackendStatus.ts](../packages/astro/src/stores/BackendStatus.ts) demonstrates both approaches with real code: `backend:metrics` updates the store directly, and `backend:status:changed` fetches a fresh snapshot. The worker emits the metrics example once per second in desktop mode.

## Dispatch from desktop code

The `dispatch(name, detail?)` helper in [desktop/main.ts](../packages/desktop/main.ts) serves the same purpose without going through WorkerRPC:

```ts
dispatch("document:opened", { path: selectedPath });
```

Use the helper where your native operation has obtained `selectedPath`. Settings updates and tray actions already use it. To target a separate WebUI window, create its own helper with `createWindowDispatcher(window)` from [desktop/dispatch.ts](../packages/desktop/dispatch.ts).

## Understand delivery

A pushed event notifies the current document; it does not wait for browser listeners to finish or return their results. The worker's RPC acknowledgement confirms desktop forwarding. Events are not buffered or replayed across navigation or disconnection.

Fetch the initial application snapshot when a page mounts, then consume live changes. The current template uses full-page navigation, so the destination page attaches its listeners again. Browser-only development does not receive WebUI push; HTTP actions still work.

[Documentation home](README.md) · [File dialogs](FileDialogs.md) · [Notifications](Notifications.md)

# State and application data

Put shared frontend state in Nanostores and keep the requests that update it in store actions. Components can then focus on rendering and user interaction. Astro client scripts and Vue islands read the same store modules.

The starter's [BackendStatus.ts](../packages/astro/src/stores/BackendStatus.ts) and [StatusPanel.vue](../packages/astro/src/components/StatusPanel.vue) are a working example: the store owns HTTP loading and error state, and the component consumes it through `@nanostores/vue`.

## Give a screen its own store

The [Backend guide](Backend.md#add-your-first-api-route) adds a small `/api/greeting` route. To use it, create `packages/astro/src/stores/Greeting.ts`:

```ts
import { atom } from "nanostores";

export const $greeting = atom<string | null>(null);
export const $greetingLoading = atom(false);
export const $greetingError = atom<string | null>(null);

export async function refreshGreeting() {
  if ($greetingLoading.get()) return;
  $greetingLoading.set(true);
  $greetingError.set(null);
  try {
    const response = await fetch("/api/greeting");
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data: { message: string } = await response.json();
    $greeting.set(data.message);
  } catch (error) {
    $greetingError.set(error instanceof Error ? error.message : String(error));
  } finally {
    $greetingLoading.set(false);
  }
}
```

The action keeps the last successful value while it refreshes and exposes errors separately. Use the same pattern for lists, selected records, or application settings that belong to your backend.

## Read it from a Vue island

Create `packages/astro/src/components/GreetingPanel.vue`:

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useStore } from "@nanostores/vue";
import {
  $greeting, $greetingLoading, $greetingError, refreshGreeting,
} from "../stores/Greeting";

const greeting = useStore($greeting);
const loading = useStore($greetingLoading);
const error = useStore($greetingError);
onMounted(refreshGreeting);
</script>

<template>
  <section class="panel">
    <h2>A message from your app</h2>
    <p v-if="greeting">{{ greeting }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" class="button" :disabled="loading"
      @click="refreshGreeting">
      {{ loading ? "Loading…" : "Refresh greeting" }}
    </button>
  </section>
</template>
```

Add `<GreetingPanel client:load />` to an Astro page after importing it. Another island can import `$greeting` and receive the same value without a Vue-specific global store.

`onMounted` makes the initial HTTP request in the browser/WebView. Astro frontmatter runs during the build, so using it for live application data would bake a build-time snapshot into your page.

## Read the same store from Astro client code

An Astro component can subscribe without introducing a Vue island:

```astro
<p data-greeting-summary>Waiting for your greeting…</p>
<script>
  import { $greeting, refreshGreeting } from '../stores/Greeting';
  const output = document.querySelector('[data-greeting-summary]');
  const unsubscribe = $greeting.subscribe((message) => {
    if (output) output.textContent = message ?? 'Waiting for your greeting…';
  });
  void refreshGreeting();
  window.addEventListener('pagehide', unsubscribe, { once: true });
</script>
```

Use this example in a component under `src/components`. A real screen usually chooses one place to initiate its initial refresh, even if several components subscribe.

## React when backend work changes something

There are two useful ways to receive a backend event. For a small value the backend already knows, update the store directly. For a changed collection or record, call the store's normal HTTP action.

The [Desktop events guide](DesktopEvents.md#push-updates-from-the-backend) shows both. The starter already uses `backend:metrics` to update live counters and `backend:status:changed` to request a fresh API snapshot. Its refresh action coalesces notifications that arrive during an in-flight request into one follow-up fetch.

Attach shared event listeners through Nanostores' `onMount`, so several subscribed islands do not create duplicate listeners. Fetch an initial snapshot when the page mounts: events are live notifications for the current document, not saved state to replay later.

## Separate window settings from application settings

[AppSettings.ts](../packages/astro/src/stores/AppSettings.ts) owns live window behavior and uses WebUI events to update the desktop host. Its transparency, title, and window-control state do not go through your HTTP API.

Your own preferences, database records, and services belong in application stores and backend code. Default config values initialize an app; Nanostores alone does not save them across launches. Add persistence in the backend when your app needs it.

[Documentation home](README.md) · [Backend](Backend.md) · [Desktop events](DesktopEvents.md)

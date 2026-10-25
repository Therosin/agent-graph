<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useStore } from "@nanostores/vue";
import type { NativePaths } from "shared/native-paths";
import type { NativeTrayStatus } from "shared/native-tray";
import { $desktopConnection } from "../stores/AppSettings";
import { useDesktopEvents } from "../vue/desktop";

const sendEvent = useDesktopEvents();
const connection = useStore($desktopConnection);
const paths = ref<NativePaths | null>(null);
const tray = ref<NativeTrayStatus | null>(null);
const clipboard = ref("Hello from Astro Desktop");
const message = ref("");
const error = ref("");
const busy = ref(false);

async function refresh() {
  if (connection.value !== "connected") return;
  try {
    [paths.value, tray.value] = await Promise.all([
      sendEvent<NativePaths>("native:paths:list"),
      sendEvent<NativeTrayStatus>("native:tray:status"),
    ]);
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); }
}

watch(connection, () => { void refresh(); }, { immediate: true });
onMounted(() => window.addEventListener("desktop:tray-action", refresh));
onUnmounted(() => window.removeEventListener("desktop:tray-action", refresh));

async function perform(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  message.value = "";
  try { await action(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure); }
  finally { busy.value = false; }
}

async function copy() {
  await perform(async () => {
    await sendEvent("native:clipboard:write", { text: clipboard.value });
    message.value = "Copied to clipboard";
  });
}

async function paste() {
  await perform(async () => {
    clipboard.value = await sendEvent<string>("native:clipboard:read");
    message.value = "Read from clipboard";
  });
}

async function openHome() {
  await perform(async () => { await sendEvent("native:shell:open-path", { path: paths.value!.home }); });
}

async function hideWindow() {
  await perform(async () => {
    await sendEvent("native:tray:hide-window");
    message.value = "Use the tray menu to show the window again";
    await refresh();
  });
}
</script>

<template>
  <section class="panel" aria-labelledby="native-desktop-heading">
    <div class="panel-heading"><div><span class="eyebrow">Desktop building blocks</span><h2 id="native-desktop-heading">Clipboard, paths, shell, and tray.</h2></div></div>
    <label style="display: grid; gap: 8px; margin: 16px 0">Clipboard text
      <textarea v-model="clipboard" aria-label="Clipboard text" rows="2" style="width: 100%; padding: 8px; color: inherit; background: transparent; border: 1px solid var(--border); border-radius: 6px" />
    </label>
    <div style="display: flex; gap: 8px; flex-wrap: wrap">
      <button type="button" class="button" :disabled="busy || connection !== 'connected'" @click="copy">Copy text</button>
      <button type="button" class="button" :disabled="busy || connection !== 'connected'" @click="paste">Paste text</button>
      <button type="button" class="button" :disabled="busy || !paths" @click="openHome">Open home folder</button>
      <button type="button" class="button" :disabled="busy || !tray?.visible" @click="hideWindow">Hide to tray</button>
    </div>
    <p v-if="tray?.available && !tray.hostAvailable" class="muted">The tray needs a desktop tray host. WSLg alone does not provide one.</p>
    <p v-else-if="tray?.error" class="muted">{{ tray.error }}</p>
    <p v-else-if="tray?.visible" class="muted" data-native-tray-status>Tray ready · use its menu to show, hide, or quit.</p>
    <p v-if="message" role="status" data-native-desktop-result>{{ message }}</p>
    <details v-if="paths" style="margin-top: 16px"><summary>Application and user folders</summary>
      <dl style="font-size: 12px; overflow-wrap: anywhere"><template v-for="(path, name) in paths" :key="name"><dt style="margin-top: 8px">{{ name }}</dt><dd style="margin-left: 0" data-native-path>{{ path }}</dd></template></dl>
    </details>
    <p v-if="connection !== 'connected'" class="muted">Open the desktop app to use native desktop features.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

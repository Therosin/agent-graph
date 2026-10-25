<script setup lang="ts">
import { ref, watch } from "vue";
import { useStore } from "@nanostores/vue";
import type { NativeToastCapabilities, NativeToastResult } from "shared/native-toast";
import { $desktopConnection } from "../stores/AppSettings";
import { useDesktopEvents } from "../vue/desktop";

const sendEvent = useDesktopEvents();
const connection = useStore($desktopConnection);
const capabilities = ref<NativeToastCapabilities | null>(null);
const busy = ref(false);
const result = ref<NativeToastResult | null>(null);
const error = ref("");

watch(connection, async (state) => {
  capabilities.value = null;
  if (state !== "connected") return;
  try {
    capabilities.value = await sendEvent<NativeToastCapabilities>("native:toast:capabilities");
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure);
  }
}, { immediate: true });

async function notify(withActions: boolean) {
  busy.value = true;
  result.value = null;
  error.value = "";
  try {
    result.value = await sendEvent<NativeToastResult>("native:toast", {
      message: withActions ? "Choose an action to return its result to the app." : "Hello from your desktop app.",
      ...(withActions ? { actions: [{ id: "continue", label: "Continue" }, { id: "later", label: "Later" }] } : {}),
    });
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="native-toast-heading">
    <div class="panel-heading"><div><span class="eyebrow">Native notifications</span><h2 id="native-toast-heading">A toast from your application.</h2></div></div>
    <p>Show an operating system notification and await its result through DesktopEvents.</p>
    <div style="display: flex; flex-wrap: wrap; gap: 8px">
      <button type="button" class="button" data-native-toast :disabled="busy || connection !== 'connected'" @click="notify(false)">Show notification</button>
      <button type="button" class="button" data-native-toast-actions :disabled="busy || !capabilities?.actions" @click="notify(true)">Show with buttons</button>
    </div>
    <p v-if="busy" class="muted">Waiting for the notification result…</p>
    <p v-else-if="connection !== 'connected'" class="muted">Open the desktop app to use native notifications.</p>
    <p v-else-if="capabilities && !capabilities.actions" class="muted">Action buttons are unavailable with this notification provider on your platform.</p>
    <p v-if="result" data-native-toast-result role="status">{{ result.event }}<template v-if="result.action">: {{ result.action }}</template></p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

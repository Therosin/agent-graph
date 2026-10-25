<script setup lang="ts">
import { ref } from "vue";
import { useStore } from "@nanostores/vue";
import { $desktopConnection } from "../stores/AppSettings";
import { useDesktopEvents } from "../vue/desktop";

const sendEvent = useDesktopEvents();
const connection = useStore($desktopConnection);
const busy = ref(false);
const result = ref<string | string[] | null>();
const error = ref("");
const actions = [
  { label: "Open file", event: "native:dialog:open-file" },
  { label: "Open files", event: "native:dialog:open-files" },
  { label: "Choose folder", event: "native:dialog:pick-folder" },
  { label: "Choose folders", event: "native:dialog:pick-folders" },
  { label: "Save file", event: "native:dialog:save-file" },
];

async function choose(event: string) {
  busy.value = true;
  result.value = undefined;
  error.value = "";
  try {
    result.value = await sendEvent<string | string[] | null>(event,
      event === "native:dialog:save-file" ? { defaultName: "example.txt" } : {},
    );
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="native-files-heading">
    <div class="panel-heading"><div><span class="eyebrow">Native file dialogs</span><h2 id="native-files-heading">Let the operating system handle selection.</h2></div></div>
    <p>Choose files, folders, or a save location and await the selected paths. The save dialog only chooses a path; it does not write a file.</p>
    <div style="display: flex; flex-wrap: wrap; gap: 8px">
      <button v-for="action in actions" :key="action.event" type="button" class="button" :disabled="busy || connection !== 'connected'" @click="choose(action.event)">{{ action.label }}</button>
    </div>
    <p v-if="busy" class="muted">Waiting for your selection…</p>
    <p v-else-if="connection !== 'connected'" class="muted">Open the desktop app to use native file dialogs.</p>
    <p v-if="result === null" data-native-file-result role="status">Cancelled</p>
    <pre v-else-if="result !== undefined" data-native-file-result style="white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 16px">{{ Array.isArray(result) ? result.join('\n') : result }}</pre>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { useStore } from "@nanostores/vue";
import {
  $appSettings,
  $desktopConnection,
  $desktopError,
  updateAppSettings,
} from "../stores/AppSettings";
const settings = useStore($appSettings);
const connection = useStore($desktopConnection);
const error = useStore($desktopError);
async function setTransparent(event: Event) {
  try {
    await updateAppSettings({
      transparent: (event.target as HTMLInputElement).checked,
    });
  } catch {
    /* AppSettings exposes the error to every subscriber. */
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="window-heading">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">Desktop integration</span>
        <h2 id="window-heading">Your window, your interface</h2>
      </div>
      <span class="badge">{{
        connection === "connected" ? "WebUI" : "Browser preview"
      }}</span>
    </div>
    <p>
      Window chrome and Vue islands share AppSettings. Native changes travel
      through WebUI events.
    </p>
    <label class="setting-row"
      ><span
        ><strong>Transparent window</strong
        ><small
          >Allow the desktop to show through the window background.</small
        ></span
      ><input
        type="checkbox"
        aria-label="Transparent window"
        :checked="settings.transparent"
        :disabled="connection !== 'connected'"
        @change="setTransparent"
    /></label>
    <p v-if="connection === 'browser'" class="muted">
      Open the desktop app to use native window controls.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

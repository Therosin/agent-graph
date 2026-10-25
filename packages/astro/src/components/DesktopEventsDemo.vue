<script lang="ts">
import { defineComponent } from "vue";
import { useStore } from "@nanostores/vue";
import { $desktopConnection } from "../stores/AppSettings";

export default defineComponent({
  setup() {
    return { connection: useStore($desktopConnection) };
  },
  data() {
    return { busy: false, reply: "", error: "" };
  },
  methods: {
    async sendExample() {
      this.busy = true;
      this.error = "";
      try {
        const reply = await this.$sendEvent<{
          data: { message: string };
          platform: string;
        }>("desktop:echo", {
          message: "Hello from Vue",
          nested: { values: [1, true, null] },
        });
        this.reply = JSON.stringify(reply, null, 2);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.busy = false;
      }
    },
  },
});
</script>

<template>
  <section class="panel" aria-labelledby="desktop-events-heading">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">Native operations</span>
        <h2 id="desktop-events-heading">Send an event. Await a result.</h2>
      </div>
    </div>
    <p>
      Vue components can call a desktop handler and receive its result as an
      object. Use the same bridge for native dialogs and other desktop features.
    </p>
    <button
      type="button"
      class="button"
      data-send-desktop-event
      :disabled="busy || connection !== 'connected'"
      @click="sendExample"
    >
      {{ busy ? "Waiting for desktop…" : "Send desktop event" }}
    </button>
    <pre
      v-if="reply"
      data-desktop-event-result
      style="
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 12px;
        margin-top: 16px;
      "
      >{{ reply }}</pre>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

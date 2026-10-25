<script setup lang="ts">
import { onMounted } from "vue";
import { useStore } from "@nanostores/vue";
import {
  $backendStatus,
  $backendLoading,
  $backendError,
  refreshBackendStatus,
} from "../stores/BackendStatus";
const status = useStore($backendStatus);
const loading = useStore($backendLoading);
const error = useStore($backendError);
onMounted(refreshBackendStatus);
</script>

<template>
  <section class="panel" aria-labelledby="backend-heading">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">Application services</span>
        <h2 id="backend-heading">Backend connection</h2>
      </div>
      <span class="badge" :class="{ 'badge-online': status && !error }">{{
        error ? "Unavailable" : status ? "Connected" : "Connecting"
      }}</span>
    </div>
    <p>
      Your API runs in its own Bun worker. This Vue component reads its state
      from a shared Nanostore. In the desktop app, live counters arrive as pushed events.
    </p>
    <dl class="metrics" v-if="status">
      <div>
        <dt>Uptime</dt>
        <dd>{{ status.uptime }}<small>seconds</small></dd>
      </div>
      <div>
        <dt>Requests</dt>
        <dd>{{ status.requests }}<small>handled</small></dd>
      </div>
    </dl>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button
      type="button"
      class="button"
      :disabled="loading"
      @click="refreshBackendStatus"
    >
      {{ loading ? "Refreshing…" : "Refresh status" }}
    </button>
  </section>
</template>

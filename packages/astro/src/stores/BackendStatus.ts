import { atom, onMount } from "nanostores";
import type { BackendStatus } from "shared/contracts";
import { onDesktopEvent } from "../desktop/events";

export const $backendStatus = atom<BackendStatus | null>(null);
export const $backendLoading = atom(false);
export const $backendError = atom<string | null>(null);
let refreshPending = false;

// One set of listeners shared by every island using this store.
onMount($backendStatus, () => {
  const metrics = onDesktopEvent<Pick<BackendStatus, "uptime" | "requests">>("backend:metrics", (detail) => {
    const status = $backendStatus.get();
    if (status) $backendStatus.set({ ...status, ...detail });
  });
  const changed = onDesktopEvent("backend:status:changed", () => { void refreshBackendStatus(); });
  return () => { metrics(); changed(); };
});

/** Components call store actions; request details stay here. */
export async function refreshBackendStatus() {
  if ($backendLoading.get()) { refreshPending = true; return; }
  $backendLoading.set(true);
  $backendError.set(null);
  try {
    const response = await fetch("/api/status", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    $backendStatus.set((await response.json()) as BackendStatus);
  } catch (error) {
    $backendError.set(error instanceof Error ? error.message : String(error));
  } finally {
    $backendLoading.set(false);
    if (refreshPending) { refreshPending = false; void refreshBackendStatus(); }
  }
}

import { atom, map } from "nanostores";
import {
  defaultWindowSettings,
  type WindowSettings,
  type WindowCommand,
} from "shared/contracts";
import { sendEvent } from "../desktop/events";

export const $appSettings = map<WindowSettings>({ ...defaultWindowSettings });
export const $desktopConnection = atom<
  "browser" | "connecting" | "connected" | "disconnected"
>("browser");
export const $desktopError = atom<string | null>(null);

/** Window settings always use WebUI events, never the backend HTTP API. */
export async function updateAppSettings(patch: Partial<WindowSettings>) {
  try {
    const settings = await sendEvent<WindowSettings>(
      "window:settings:set",
      patch,
    );
    $appSettings.set(settings);
    $desktopError.set(null);
  } catch (error) {
    $desktopError.set(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function windowCommand(command: WindowCommand) {
  try {
    await sendEvent("window:command", { command });
  } catch (error) {
    $desktopError.set(error instanceof Error ? error.message : String(error));
  }
}

export function connectAppSettings(initial: Partial<WindowSettings> = {}) {
  $appSettings.set({ ...$appSettings.get(), ...initial });
  let cleanup = () => {};
  const start = () => {
    cleanup = connectBridge(initial);
  };
  // webui.js constructs window.webui in its DOMContentLoaded listener.
  if (!window.webui && document.readyState !== "complete")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  return () => {
    document.removeEventListener("DOMContentLoaded", start);
    cleanup();
  };
}

function connectBridge(initial: Partial<WindowSettings>) {
  const bridge = window.webui;
  if (!bridge) {
    $desktopConnection.set("browser");
    return () => {};
  }
  $desktopConnection.set("connecting");
  let disposed = false;
  const sync = async () => {
    if (!bridge.isConnected()) {
      $desktopConnection.set("disconnected");
      return;
    }
    try {
      const settings = await sendEvent<WindowSettings>("window:settings:get");
      if (disposed) return;
      $appSettings.set(settings);
      if (Object.keys(initial).length) await updateAppSettings(initial);
      $desktopConnection.set("connected");
      $desktopError.set(null);
    } catch (error) {
      if (!disposed) {
        $desktopConnection.set("disconnected");
        $desktopError.set(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  };
  const receive = (event: Event) => {
    $appSettings.set((event as CustomEvent<WindowSettings>).detail);
  };
  window.addEventListener("desktop:settings", receive);
  bridge.setEventCallback(() => {
    if (!disposed) void sync();
  });
  if (bridge.isConnected()) void sync();
  return () => {
    disposed = true;
    window.removeEventListener("desktop:settings", receive);
  };
}

import { WebUI } from "WebUI";
import { AppConfig, DesktopConfig } from "config";
import { defaultWindowSettings } from "shared/contracts";
import { startBackend } from "./backend";
import { createWindowController } from "./window";
import { DesktopEvents, bindDesktopEvents } from "./events";
import { createWindowDispatcher, type WindowDispatcher } from "./dispatch";
import toasts from "./components/native_toast";
import filebrowser from "./components/native_filebrowser";
import shell from "./components/native_shell";
import clipboard from "./components/native_clipboard";
import paths from "./components/native_paths";
import tray from "./components/native_tray";

export interface DesktopRuntime {
  window: WebUI;
  controller: ReturnType<typeof createWindowController>;
  events: DesktopEvents;
  dispatch: WindowDispatcher;
  close(): void;
}

export async function runDesktop(
  onReady?: (runtime: DesktopRuntime) => Promise<void>,
) {
  const window = new WebUI();
  const bridgePort = Number(process.env.WEBUI_PORT ?? WebUI.getFreePort());
  if (!window.setPort(bridgePort))
    throw new Error(`WebUI port ${bridgePort} is unavailable`);
  const defaults = DesktopConfig.defaults;
  window.setSize(defaults.width, defaults.height);
  window.setMinimumSize(defaults.minWidth, defaults.minHeight);
  window.setFrameless(defaults.frameless);
  window.setTransparent(defaultWindowSettings.transparent);
  window.setResizable(defaultWindowSettings.resizable);
  if (defaults.centered) window.setCenter();

  const dispatch = createWindowDispatcher(window);
  const controller = createWindowController(window, (settings) => dispatch("desktop:settings", settings));
  const events = new DesktopEvents();
  toasts.register(events);
  filebrowser.register(events);
  shell.register(events);
  clipboard.register(events);
  paths.register(events);
  events.on("window:settings:get", () => controller.settings);
  events.on("window:settings:set", (settings) => controller.update(settings));
  events.on<{ command: string }>("window:command", ({ command }) =>
    controller.command(command),
  );
  // A small round-trip example; register application-specific native operations here.
  events.on("desktop:echo", async (data) => {
    await Bun.sleep(10);
    return { data, platform: process.platform };
  });
  bindDesktopEvents(window, events);

  // WebUI owns its bridge server; Astro is the WebView's document (no iframe).
  let runtime: Awaited<ReturnType<typeof startBackend>> | undefined;
  let stopping = false;
  const shutdown = () => {
    stopping = true;
    WebUI.exit();
  };
  tray.register(events, {
    windowHandle: () => process.platform === "win32" ? window.win32GetHwnd() || window.getHwnd() : window.getHwnd(),
    quit: shutdown,
    onAction: (id) => dispatch("desktop:tray-action", { id }),
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    // showWebView starts WebUI's bridge server on bridgePort. Starting a separate
    // persistent server first would keep waitAsync alive after the window closes.
    runtime = await startBackend({
      bridgeOrigin: `http://127.0.0.1:${bridgePort}`,
    }, dispatch);
    const origin = Bun.isStandaloneExecutable
      ? runtime.origin
      : (process.env.ASTRO_DEV_ORIGIN ?? runtime.origin);
    const response = await fetch(origin, { signal: AbortSignal.timeout(5000) });
    if (!response.ok)
      throw new Error(
        `Frontend unavailable at ${origin}. Run bun run build or bun run dev.`,
      );
    if (!window.showWebView(origin))
      throw new Error(
        `WebUI could not open a WebView: ${WebUI.getLastErrorMessage() || "check the platform WebView runtime"} (${WebUI.getLastErrorNumber()}).`,
      );
    console.log(`${AppConfig.appName} ${AppConfig.appVersion} ready: ${origin} (WebUI bridge ${bridgePort})`);
    let failure: Error | undefined;
    const task = onReady?.({
      window,
      controller,
      events,
      dispatch,
      close: shutdown,
    }).catch((error) => {
      failure =
        error instanceof Error
          ? error
          : new Error(String(error) || "Desktop task failed");
      shutdown();
    });
    let last = performance.now();
    while (!stopping && WebUI.waitAsync()) {
      const now = performance.now();
      tray.update();
      runtime.backend.update(now - last);
      last = now;
      await Bun.sleep(16);
    }
    await task;
    if (failure) throw failure;
  } finally {
    tray.destroy();
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    try {
      await runtime?.stop();
    } finally {
      WebUI.exit();
      WebUI.clean();
    }
  }
}

// The upstream binding owns an internal FFI worker; finish after coordinated cleanup.
if (import.meta.main) {
  try {
    const verify = process.argv.includes("--smoke-test")
      ? (await import("./smoke")).verifyDesktop
      : undefined;
    await runDesktop(verify);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

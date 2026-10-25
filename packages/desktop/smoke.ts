import type { DesktopRuntime } from "./main";
import { AppConfig, TrayConfig } from "config";
import filebrowser from "./components/native_filebrowser";
import paths from "./components/native_paths";
import tray from "./components/native_tray";

// Runs against a real WebView and native WebUI callbacks, without a mock bridge.
async function waitFor(check: () => Promise<boolean>, label: string) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (await check()) {
      console.log(`PASS ${label}`);
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`Native check timed out: ${label}`);
}

export async function verifyDesktop({
  window,
  controller,
  events,
}: DesktopRuntime): Promise<void> {
  if (process.arch === "x64" || process.platform === "darwin") {
    if (filebrowser.backend() !== "ffi") throw new Error("Native file-dialog library failed to load");
    console.log("PASS native file-dialog FFI library loaded");
  }
  const evaluate = async (expression: string) =>
    window.script(`return (${expression});`, { timeout: 3 });
  const matches = async (expression: string) => {
    try {
      return (await evaluate(`Boolean(${expression})`)) === "true";
    } catch {
      return false;
    } // A full-page navigation temporarily disconnects the bridge.
  };
  await waitFor(
    () =>
      matches(
        `document.querySelector('[data-desktop-connection]')?.textContent === 'Desktop'`,
      ),
    "WebUI bridge and AppSettings connected",
  );
  const resolvedPaths = paths.all();
  if (!resolvedPaths.data.includes(AppConfig.id) || !resolvedPaths.documents || !resolvedPaths.downloads)
    throw new Error("Native paths are incomplete or use the wrong application identity");
  console.log("PASS application and user paths resolve for this OS");
  window.run(`window.webui.call('desktop_event', JSON.stringify({type:'native:clipboard:read',data:null})).then(json => {const result=JSON.parse(json);window.__clipboardReadCheck={ok:result.ok,text:typeof result.data==='string',error:result.error};});`);
  await waitFor(() => matches("window.__clipboardReadCheck !== undefined"), "clipboard read returned through DesktopEvents");
  if (!(await matches("window.__clipboardReadCheck.ok === true && window.__clipboardReadCheck.text")))
    throw new Error(`Native clipboard failed: ${await evaluate("JSON.stringify(window.__clipboardReadCheck)")}`);
  const trayState = tray.status();
  if (process.platform === "win32" && !trayState.available) throw new Error(`Windows tray failed: ${trayState.error}`);
  if (trayState.available) {
    const title = trayState.tooltip;
    tray.setTooltip("Native tray smoke test");
    if (tray.status().tooltip !== "Native tray smoke test") throw new Error("Tray tooltip update failed");
    tray.setTooltip(title);
    console.log(`PASS native tray created and updated (host ${tray.status().hostAvailable ? "available" : "not present"})`);
    if (trayState.hostAvailable) {
      await events.emit("native:tray:hide-window");
      if (tray.status().windowVisible) throw new Error("Tray did not hide the window");
      await events.emit("native:tray:show-window");
      if (!tray.status().windowVisible) throw new Error("Tray did not restore the window");
      console.log("PASS tray hides and restores the existing window");
    }
    if (process.env.NATIVE_TRAY_TEST === "1") {
      let selected = false;
      tray.onAction((id) => { if (id === "smoke-check") selected = true; });
      tray.setMenu([...TrayConfig.defaults.menu, { id: "smoke-check", label: "Native tray integration check" }]);
      console.log("TRAY_MENU_TEST_READY");
      await waitFor(async () => selected, "native tray menu action reaches the desktop callback");
      tray.setMenu(TrayConfig.defaults.menu);
    }
  }
  await waitFor(
    () => matches(
      `document.querySelector('meta[name="application-name"]')?.content === ${JSON.stringify(AppConfig.appName)} && document.querySelector('meta[name="application-version"]')?.content === ${JSON.stringify(AppConfig.appVersion)} && document.querySelector('[data-window-title]')?.textContent === ${JSON.stringify(controller.settings.title)}`,
    ),
    "Astro metadata, client store, and native window share application config",
  );
  const backendStatus = await (await fetch(await evaluate("location.origin") + "/api/status")).json();
  if (JSON.stringify(backendStatus.app) !== JSON.stringify(AppConfig))
    throw new Error("Backend worker application config differs from the desktop host");
  console.log("PASS backend worker shares application identity and build metadata");
  await waitFor(
    () =>
      matches(
        `document.querySelector('.badge-online')?.textContent === 'Connected'`,
      ),
    "Vue island fetched backend data",
  );
  const uptimeBefore = Number(await evaluate("parseInt(document.querySelector('.metrics dd').textContent, 10)"));
  const statusRequests = await evaluate("performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname === '/api/status').length");
  await waitFor(
    () => matches(`parseInt(document.querySelector('.metrics dd').textContent, 10) > ${uptimeBefore}`),
    "backend WorkerRPC push updates the frontend Nanostore",
  );
  if (await evaluate("performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname === '/api/status').length") !== statusRequests)
    throw new Error("Live backend updates unexpectedly polled the HTTP API");
  console.log("PASS pushed values reach Vue without HTTP polling");
  window.run(`document.querySelector('[data-send-desktop-event]').click();`);
  await waitFor(
    () =>
      matches(
        `document.querySelector('[data-desktop-event-result]')?.textContent.includes('Hello from Vue')`,
      ),
    "Vue global $sendEvent awaits an async native handler",
  );
  const toast = {
    message: "DesktopEvents native toast smoke test",
    timeout: 1,
    ...(process.platform === "linux" ? {} : { actions: [{ id: "continue", label: "Continue" }] }),
  };
  window.run(`window.webui.call('desktop_event', JSON.stringify({type:'native:toast',data:${JSON.stringify(toast)}})).then(json => { window.__nativeToastResult = JSON.parse(json); });`);
  await waitFor(() => matches("window.__nativeToastResult !== undefined"), "native toast callback returned through WebUI");
  if (!(await matches("window.__nativeToastResult.ok === true && typeof window.__nativeToastResult.data.event === 'string'")))
    throw new Error(`Native toast failed: ${await evaluate("JSON.stringify(window.__nativeToastResult)")}`);
  if (process.platform === "linux" && !(await matches("window.__nativeToastResult.data.event === 'sent'")))
    throw new Error(`Linux toast was not delivered: ${await evaluate("JSON.stringify(window.__nativeToastResult)")}`);
  console.log("PASS native toast helper and JSON result");
  events.on("test:failure", async () => {
    throw new Error("Native example failure");
  });
  window.run(
    `window.webui.call('desktop_event', JSON.stringify({type:'test:failure',data:null})).then(json => { window.__nativeEventFailure = JSON.parse(json); });`,
  );
  await waitFor(
    () =>
      matches(
        `window.__nativeEventFailure?.ok === false && window.__nativeEventFailure.error.message === 'Native example failure'`,
      ),
    "async native failures return a JSON error",
  );
  events.on<{ id: number; delay: number }>("test:delayed", async (data) => {
    await Bun.sleep(data.delay);
    return { id: data.id };
  });
  window.run(
    `Promise.all([{id:1,delay:30},{id:2,delay:0}].map(data => window.webui.call('desktop_event', JSON.stringify({type:'test:delayed',data})))).then(replies => { window.__nativeConcurrentEvents = replies.map(JSON.parse); });`,
  );
  await waitFor(
    () =>
      matches(
        `window.__nativeConcurrentEvents?.[0]?.data.id === 1 && window.__nativeConcurrentEvents?.[1]?.data.id === 2`,
      ),
    "concurrent native event calls return their own results",
  );
  const expectedTransparent = !controller.settings.transparent;
  await evaluate(
    `document.querySelector('input[aria-label="Transparent window"]').click()`,
  );
  await waitFor(
    async () => controller.settings.transparent === expectedTransparent,
    "Vue → AppSettings → native transparency setting",
  );
  await waitFor(
    () =>
      matches(
        `document.querySelector('[data-window-chrome]')?.dataset.transparent === '${expectedTransparent}'`,
      ),
    "native window state reflected in Astro chrome",
  );
  controller.update({ title: "Native smoke test", minimisable: false });
  await waitFor(
    () =>
      matches(
        `document.querySelector('[data-window-title]')?.textContent === 'Native smoke test' && document.querySelector('[data-window-command="minimize"]')?.hidden`,
      ),
    "native events update frontend store and controls",
  );
  window.run(`location.href = '/docs/';`);
  await waitFor(
    () =>
      matches(
        `document.querySelector('h1')?.textContent === 'Working with the template' && document.querySelector('[data-desktop-connection]')?.textContent === 'Desktop'`,
      ),
    "MDX navigation reconnects the native bridge",
  );
  await waitFor(
    () =>
      matches(
        `document.querySelector('.badge-online')?.textContent === 'Connected'`,
      ),
    "MDX Vue island uses the backend",
  );
  const nextUptime = Number(await evaluate("parseInt(document.querySelector('.metrics dd').textContent, 10)"));
  await waitFor(
    () => matches(`parseInt(document.querySelector('.metrics dd').textContent, 10) > ${nextUptime}`),
    "backend push reaches the store after full-page navigation",
  );
  await waitFor(
    () =>
      matches(
        `document.querySelector('[data-window-title]')?.textContent === 'Native smoke test'`,
      ),
    "window settings survive full-page navigation",
  );
  window.run(
    `document.querySelector('[data-window-command="close"]').click();`,
  );
  await waitFor(
    async () => !window.isShown,
    "native close button closes the window",
  );
}

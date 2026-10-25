import { expect, test } from "@playwright/test";
import { AppConfig, WindowConfig } from "../packages/config/config";

test("browser preview, API store action, and an MDX page with a Vue island", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(`Overview · ${AppConfig.appName}`);
  await expect(page.locator('meta[name="application-version"]')).toHaveAttribute("content", AppConfig.appVersion);
  await expect(page.locator("[data-window-title]")).toHaveText(WindowConfig.defaults.title);
  await expect(
    page.getByRole("heading", { name: "Make it your own." }),
  ).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close window" }),
  ).toBeDisabled();
  const requests = page.locator(".metrics dd").nth(1);
  const before = Number((await requests.innerText()).split("\n")[0]);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect
    .poll(async () => Number((await requests.innerText()).split("\n")[0]))
    .toBeGreaterThan(before);
  await page.screenshot({ path: ".logs/overview.png" });
  await page.getByRole("link", { name: "Documentation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Working with the template" }),
  ).toBeVisible();
  await expect(page.getByText("Start with the right boundary")).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.locator("[data-window-chrome]")).toHaveCount(1);
  await page.screenshot({ path: ".logs/documentation.png" });
  expect(errors).toEqual([]);
});

test("pushed values update the shared store without HTTP, and invalidation fetches through its API action", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/status") requests++; });
  await page.goto("/");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  const initial = requests;
  const uptime = page.locator(".metrics dd").nth(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("backend:metrics", { detail: { uptime: 4242, requests: 88 } })));
  await expect(uptime).toHaveText("4242seconds");
  await expect(page.locator(".metrics dd").nth(1)).toHaveText("88handled");
  expect(requests).toBe(initial);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("backend:status:changed")));
  await expect.poll(() => requests).toBe(initial + 1);
  await expect(uptime).not.toHaveText("4242seconds");
  // A change during an in-flight snapshot must trigger one follow-up fetch.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let refreshes = 0;
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    if (++refreshes === 1) await held;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("backend:status:changed")));
  await expect.poll(() => refreshes).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("backend:status:changed"));
    window.dispatchEvent(new CustomEvent("backend:status:changed"));
  });
  release();
  await expect.poll(() => refreshes).toBe(2);
  await expect(page.getByRole("button", { name: "Refresh status" })).toBeEnabled();
  await page.unroute("**/api/status");
  await page.getByRole("link", { name: "Documentation", exact: true }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("backend:metrics", { detail: { uptime: 5151, requests: 99 } })));
  await expect(page.locator(".metrics dd").nth(0)).toHaveText("5151seconds");
});

test("WebUI readiness at DOMContentLoaded and events drive the shared window store", async ({
  page,
}) => {
  // Match native script timing. An early module sees readyState=interactive before the bridge exists.
  await page.route("**/webui.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    document.addEventListener('DOMContentLoaded', () => {
      let settings = {title:'Test window',transparent:true,minimisable:true,maximisable:true,closeable:true,resizable:true};
      let echoCount = 0;
      let clipboardText = 'Desktop clipboard';
      const trayState = {supported:true,available:true,hostAvailable:true,visible:true,windowVisible:true,tooltip:'Test app',icon:'',error:null};
      window.webui = {
        isConnected: () => true,
        setEventCallback: () => {},
        call: async (name, json) => {
          if (name !== 'desktop_event') throw new Error('Unexpected WebUI binding');
          const {type,data} = JSON.parse(json);
          if (type === 'native:clipboard:read') return JSON.stringify({ok:true,data:clipboardText});
          if (type === 'native:clipboard:write') { clipboardText=data.text; return JSON.stringify({ok:true,data:null}); }
          if (type === 'native:paths:list') return JSON.stringify({ok:true,data:{home:'/example',data:'/example/app/data',config:'/example/app/config',cache:'/example/app/cache',log:'/example/app/log',temp:'/tmp/app',documents:'/example/Documents',downloads:'/example/Downloads',desktop:'/example/Desktop'}});
          if (type === 'native:tray:status') return JSON.stringify({ok:true,data:trayState});
          if (type === 'native:tray:hide-window') { trayState.windowVisible=false; return JSON.stringify({ok:true,data:null}); }
          if (type.startsWith('native:shell:')) { window.__shellRequest={type,data}; return JSON.stringify({ok:true,data:null}); }
          if (type.startsWith('native:dialog:')) {
            const results = {
              'native:dialog:open-file':'/example/notes.txt',
              'native:dialog:open-files':['/example/one.txt','/example/two.txt'],
              'native:dialog:pick-folder':null,
              'native:dialog:pick-folders':['/example/docs'],
              'native:dialog:save-file':'/example/export.txt'
            };
            return JSON.stringify({ok:true,data:results[type]});
          }
          if (type === 'native:toast:capabilities') return JSON.stringify({ok:true,data:{platform:'test',actions:true}});
          if (type === 'native:toast') {
            window.__toastRequest = data;
            await new Promise(resolve => setTimeout(resolve, 30));
            return JSON.stringify({ok:true,data:data.actions ? {event:'action',action:data.actions[0].id} : {event:'timeout',action:null}});
          }
          if (type === 'window:settings:set') {
            settings = {...settings, ...data};
            window.dispatchEvent(new CustomEvent('desktop:settings', {detail: settings}));
          }
          if (type === 'desktop:echo') {
            await new Promise(resolve => setTimeout(resolve, 30));
            if (echoCount++) return JSON.stringify({ok:false,error:{name:'Error',message:'Native operation failed'}});
            return JSON.stringify({ok:true,data:{data,platform:'test'}});
          }
          return JSON.stringify({ok:true,data:settings});
        }
      };
    });
  `,
    }),
  );
  await page.goto("/");
  await expect(page.locator("[data-desktop-connection]")).toHaveText("Desktop");
  await expect(page.locator("[data-window-title]")).toHaveText("Test window");
  const transparent = page.getByRole("checkbox", {
    name: "Transparent window",
  });
  await expect(transparent).toBeEnabled();
  await transparent.uncheck();
  await expect(page.locator("[data-window-chrome]")).toHaveAttribute(
    "data-transparent",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Close window" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send desktop event" }).click();
  await expect(page.locator("[data-desktop-event-result]")).toContainText(
    "Hello from Vue",
  );
  const result = JSON.parse(
    await page.locator("[data-desktop-event-result]").innerText(),
  );
  expect(result).toEqual({
    data: { message: "Hello from Vue", nested: { values: [1, true, null] } },
    platform: "test",
  });
  await page.getByRole("button", { name: "Send desktop event" }).click();
  await expect(page.getByRole("alert")).toHaveText("Native operation failed");
  await page.getByRole("button", { name: "Show with buttons" }).click();
  await expect(page.locator("[data-native-toast-result]")).toHaveText("action: continue");
  await page.getByRole("button", { name: "Show notification", exact: true }).click();
  await expect(page.locator("[data-native-toast-result]")).toHaveText("timeout");
  await page.getByRole("button", { name: "Open file", exact: true }).click();
  await expect(page.locator("[data-native-file-result]")).toHaveText("/example/notes.txt");
  await page.getByRole("button", { name: "Open files", exact: true }).click();
  await expect(page.locator("[data-native-file-result]")).toContainText("/example/two.txt");
  await page.getByRole("button", { name: "Choose folder", exact: true }).click();
  await expect(page.locator("[data-native-file-result]")).toHaveText("Cancelled");
  await page.getByRole("button", { name: "Choose folders", exact: true }).click();
  await expect(page.locator("[data-native-file-result]")).toHaveText("/example/docs");
  await page.getByRole("button", { name: "Save file", exact: true }).click();
  await expect(page.locator("[data-native-file-result]")).toHaveText("/example/export.txt");
  await page.getByRole("textbox", { name: "Clipboard text" }).fill("Copy this example");
  await page.getByRole("button", { name: "Copy text", exact: true }).click();
  await expect(page.locator("[data-native-desktop-result]")).toHaveText("Copied to clipboard");
  await page.getByRole("textbox", { name: "Clipboard text" }).fill("");
  await page.getByRole("button", { name: "Paste text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Clipboard text" })).toHaveValue("Copy this example");
  await expect(page.locator("[data-native-tray-status]")).toContainText("Tray ready");
  await page.getByRole("button", { name: "Open home folder", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as {__shellRequest: unknown}).__shellRequest)).toEqual({type:'native:shell:open-path',data:{path:'/example'}});
  await page.getByRole("button", { name: "Hide to tray", exact: true }).click();
  await expect(page.locator("[data-native-desktop-result]")).toContainText("tray menu");
});

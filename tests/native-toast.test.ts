import { expect, test } from "bun:test";
import type { Notifier, NotificationOptions } from "toasted-notifier";
import { AppConfig, ToastConfig } from "../packages/config/config";
import toasts from "../packages/desktop/components/native_toast";
import { DesktopEvents } from "../packages/desktop/events";

const { create: createNativeToast, capabilities: toastCapabilities } = toasts;

test("native toast requests await their own callbacks and preserve button ids over JSON", async () => {
  const requests: { options: NotificationOptions; callback: Parameters<Notifier["notify"]>[1] }[] = [];
  const notify = createNativeToast(async () => ({
    notify: (options, callback) => { requests.push({ options, callback }); },
  }), "win32");
  const events = new DesktopEvents();
  events.on("native:toast", notify);
  const first = events.receive(JSON.stringify({ type: "native:toast", data: {
    message: "First", actions: [{ id: "open-document", label: "Open Document" }],
  } }));
  const second = events.receive(JSON.stringify({ type: "native:toast", data: { message: "Second" } }));
  await Bun.sleep(0);
  expect(requests[0]!.options).toMatchObject({
    title: AppConfig.appName, sound: ToastConfig.defaults.sound,
    timeout: ToastConfig.defaults.timeout, actions: ["Open Document"],
  });
  requests[1]!.callback(null, "timeout", { action: "timedout" });
  requests[0]!.callback(null, "open document", { action: "buttonClicked", button: "Open Document" });
  expect(JSON.parse(await first)).toEqual({ ok: true, data: { event: "action", action: "open-document" } });
  expect(JSON.parse(await second)).toEqual({ ok: true, data: { event: "timeout", action: null } });
});

test("macOS action metadata maps to ids, native dismissal stays distinct from button labels", async () => {
  let response = { activationType: "actionClicked", activationValue: "Continue" };
  const notify = createNativeToast(async () => ({ notify: (_options, callback) => callback(null, response.activationType, response) }), "darwin");
  expect(await notify({ message: "Choose", actions: [{ id: "continue", label: "Continue" }] }))
    .toEqual({ event: "action", action: "continue" });
  response = { activationType: "timedout", activationValue: "" };
  expect(await notify({ message: "Wait", actions: [{ id: "timedout", label: "Timedout" }] }))
    .toEqual({ event: "timeout", action: null });
});

test("macOS body clicks and Linux delivery callbacks have distinct results", async () => {
  const clicked = createNativeToast(async () => ({ notify: (_options, callback) => callback(null, "activate", { activationType: "contentsClicked" }) }), "darwin");
  const sent = createNativeToast(async () => ({ notify: (_options, callback) => callback(null, "") }), "linux");
  expect(await clicked({ message: "Open" })).toEqual({ event: "click", action: null });
  expect(await sent({ message: "Delivered" })).toEqual({ event: "sent", action: null });
});

test("invalid requests and unsupported actions fail before invoking a notifier", async () => {
  let invoked = false;
  const notify = createNativeToast(async () => { invoked = true; throw new Error("unreachable"); }, "linux");
  for (const options of [null, {}, { message: "" }, { message: "Hello", timeout: -1 },
    { message: "Hello", actions: [{ id: "open", label: "Open" }] },
    { message: "Hello", actions: [{ id: "one", label: "Same" }, { id: "two", label: "Same" }] },
  ]) await expect(notify(options)).rejects.toThrow();
  expect(invoked).toBe(false);
  expect(toastCapabilities("linux").actions).toBe(false);
  expect(toastCapabilities("win32").actions).toBe(true);
});

test("native failures become rejected desktop event results", async () => {
  const notify = createNativeToast(async () => ({ notify: (_options, callback) => callback(new Error("Notifications unavailable")) }));
  const events = new DesktopEvents();
  events.on("native:toast", notify);
  expect(JSON.parse(await events.receive(JSON.stringify({ type: "native:toast", data: { message: "Hello" } }))))
    .toMatchObject({ ok: false, error: { message: "Notifications unavailable" } });
});

test("native components register their app-lifetime handlers through the default API", async () => {
  const events = new DesktopEvents();
  expect(toasts.register(events)).toBeUndefined();
  expect(await events.emit("native:toast:capabilities")).toEqual(toasts.capabilities());
});

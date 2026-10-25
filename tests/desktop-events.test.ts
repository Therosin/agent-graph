import { expect, test } from "bun:test";
import {
  DesktopEvents,
  DesktopRequestEvent,
  bindDesktopEvents,
} from "../packages/desktop/events";
import { DESKTOP_EVENT_BINDING } from "../packages/shared/desktop-events";
import { sendEvent } from "../packages/astro/src/desktop/events";

test("JSON event requests await asynchronous object results and normalize cancellation", async () => {
  const events = new DesktopEvents();
  events.on<{ nested: { values: unknown[] } }>(
    "native:example",
    async (data) => {
      await Bun.sleep(5);
      return { received: data, selected: ["example.txt"] };
    },
  );
  const data = { nested: { values: [1, "text", true, null] } };
  expect(
    JSON.parse(
      await events.receive(JSON.stringify({ type: "native:example", data })),
    ),
  ).toEqual({
    ok: true,
    data: { received: data, selected: ["example.txt"] },
  });
  events.on("native:cancel", () => null);
  expect(JSON.parse(await events.receive('{"type":"native:cancel"}'))).toEqual({
    ok: true,
    data: null,
  });
});

test("concurrent requests resolve independently, even when completed out of order", async () => {
  const events = new DesktopEvents();
  const completion: number[] = [];
  events.on<{ delay: number; id: number }>("work", async (data) => {
    await Bun.sleep(data.delay);
    completion.push(data.id);
    return data.id;
  });
  const [first, second] = await Promise.all([
    events.receive(
      JSON.stringify({ type: "work", data: { delay: 20, id: 1 } }),
    ),
    events.receive(JSON.stringify({ type: "work", data: { delay: 0, id: 2 } })),
  ]);
  expect(JSON.parse(first).data).toBe(1);
  expect(JSON.parse(second).data).toBe(2);
  expect(completion).toEqual([2, 1]);
});

test("malformed requests, missing handlers, failures, and non-JSON results return errors", async () => {
  const events = new DesktopEvents();
  events.on("reject", async () => {
    throw new TypeError("Native operation failed");
  });
  events.on("bigint", () => 1n);
  for (const json of [
    "{",
    "null",
    "[]",
    '{"type":""}',
    '{"type":"missing"}',
    '{"type":"bigint"}',
  ]) {
    expect(JSON.parse(await events.receive(json)).ok).toBe(false);
  }
  expect(JSON.parse(await events.receive('{"type":"reject"}'))).toEqual({
    ok: false,
    error: { name: "TypeError", message: "Native operation failed" },
  });
});

test("EventTarget respondWith and listener cleanup support custom responders", async () => {
  const events = new DesktopEvents();
  events.addEventListener("direct", (event) =>
    (event as DesktopRequestEvent).respondWith(
      Promise.resolve({ selected: true }),
    ),
  );
  expect(await events.emit("direct")).toEqual({ selected: true });
  const off = events.on("example", () => 42);
  expect(() => events.on("example", () => 0)).toThrow("already registered");
  off();
  expect(JSON.parse(await events.receive('{"type":"example"}')).ok).toBe(false);
  events.on("example", () => 43);
  off(); // An old unsubscribe must not remove the replacement handler.
  expect(await events.emit("example")).toBe(43);
});

test("the WebUI binding and frontend helper encode/decode objects and propagate errors", async () => {
  const events = new DesktopEvents();
  events.on("echo", async (data) => data);
  events.on("failure", async () => {
    throw new RangeError("Picker failed");
  });
  let binding!: (event: {
    arg: { string(index: number): string };
  }) => Promise<string>;
  bindDesktopEvents(
    {
      bind(name, handler) {
        expect(name).toBe(DESKTOP_EVENT_BINDING);
        binding = handler;
      },
    },
    events,
  );
  // Exercise the same client implementation Vue installs globally, without a browser.
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      webui: {
        isConnected: () => true,
        call: async (name: string, json: string) => {
          expect(name).toBe(DESKTOP_EVENT_BINDING);
          return binding({ arg: { string: () => json } });
        },
      },
    },
  });
  try {
    const data = { nested: ["a", 2, { value: true }] };
    expect(await sendEvent("echo", data)).toEqual(data);
    const error = await sendEvent("failure").catch((error) => error);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error))
      throw new Error("Expected the desktop failure to reject");
    expect(error.name).toBe("RangeError");
    expect(error.message).toBe("Picker failed");
    expect(
      await sendEvent("missing").catch((error) => error.message),
    ).toContain("No desktop handler");
    events.on("never", () => new Promise(() => {}));
    expect(
      await sendEvent("never", null, { timeoutMs: 10 }).catch(
        (error) => error.message,
      ),
    ).toContain("timed out");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

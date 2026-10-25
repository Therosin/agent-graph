import { expect, test } from "bun:test";
import { createWindowDispatcher } from "../packages/desktop/dispatch";

test("window dispatch roundtrips JSON as CustomEvent detail without interpreting it as code", () => {
  const page = new EventTarget();
  const dispatch = createWindowDispatcher({
    run(script) { new Function("window", "CustomEvent", script)(page, CustomEvent); },
  });
  const name = 'example:"quoted"\n✓';
  const detail = JSON.parse('{"__proto__":{"value":42}}');
  detail.message = '\"); throw new Error("injected"); //';
  detail.nested = [true, null, 2];
  const received: unknown[] = [];
  page.addEventListener(name, (event) => received.push((event as CustomEvent).detail));
  dispatch(name, detail);
  dispatch(name);
  expect(received).toEqual([detail, null]);
  expect(Object.hasOwn(received[0] as object, "__proto__")).toBe(true);
  expect(Object.getPrototypeOf(received[0])).toBe(Object.prototype);
});

test("invalid window events fail before calling WebUI", () => {
  let calls = 0;
  const dispatch = createWindowDispatcher({ run() { calls++; } });
  expect(() => dispatch(" ")).toThrow("name");
  expect(() => dispatch("example", 1n)).toThrow();
  expect(() => dispatch("example", () => {})).toThrow("JSON");
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() => dispatch("example", cycle)).toThrow();
  expect(calls).toBe(0);
});

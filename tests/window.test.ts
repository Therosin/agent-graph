import { expect, test } from "bun:test";
import { createWindowController } from "../packages/desktop/window";

test("window settings apply at the native boundary and disabled controls are enforced", () => {
  const calls: string[] = [];
  const window = {
    setTransparent: (value: boolean) => {
      calls.push(`transparent:${value}`);
    },
    setResizable: (value: boolean) => {
      calls.push(`resizable:${value}`);
    },
    setCloseHandlerWV: (value: boolean) => {
      calls.push(`closeable:${value}`);
    },
    minimize: () => {
      calls.push("minimize");
    },
    maximize: () => {
      calls.push("maximize");
    },
    close: () => {
      calls.push("close");
    },
    run: (script: string) => {
      calls.push(script);
    },
  };
  let changed = 0;
  const controller = createWindowController(window, () => changed++);
  controller.update({ transparent: false, closeable: false, title: "My app" });
  expect(calls).toContain("transparent:false");
  expect(calls).toContain("closeable:false");
  expect(changed).toBe(1);
  expect(() => controller.command("close")).toThrow("unavailable");
  expect(() => controller.update({ arbitrary: true })).toThrow(
    "Invalid window setting",
  );
  expect(() => controller.update({ title: true })).toThrow(
    "Invalid window setting",
  );
  expect(() => controller.update({ toString: true })).toThrow(
    "Invalid window setting",
  );
  controller.command("minimize");
  expect(calls).toContain("minimize");
});

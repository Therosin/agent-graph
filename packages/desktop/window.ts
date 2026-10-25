import {
  defaultWindowSettings,
  parseWindowSettings,
  type WindowSettings,
} from "shared/contracts";

/** Native boundary can also be exercised without opening a GUI. */
export interface NativeWindow {
  setTransparent(value: boolean): void;
  setResizable(value: boolean): void;
  setCloseHandlerWV(value: boolean): void;
  minimize(): void;
  maximize(): void;
  close(): unknown;
  run(script: string): void;
}

export function createWindowController(
  window: NativeWindow,
  onChange: (settings: WindowSettings) => void,
) {
  let settings = { ...defaultWindowSettings };
  return {
    get settings() {
      return { ...settings };
    },
    update(value: unknown) {
      const patch = parseWindowSettings(value);
      const next = { ...settings, ...patch };
      if ("transparent" in patch) window.setTransparent(next.transparent);
      if ("resizable" in patch) window.setResizable(next.resizable);
      if ("closeable" in patch) window.setCloseHandlerWV(next.closeable);
      if ("title" in patch)
        window.run(`document.title = ${JSON.stringify(next.title)};`);
      settings = next;
      onChange({ ...settings });
      return { ...settings };
    },
    command(command: string) {
      if (command === "minimize" && settings.minimisable) window.minimize();
      else if (
        command === "maximize" &&
        settings.maximisable &&
        settings.resizable
      )
        window.maximize();
      else if (command === "close" && settings.closeable) window.close();
      else throw new Error(`Window command unavailable: ${command}`);
      return true;
    },
  };
}

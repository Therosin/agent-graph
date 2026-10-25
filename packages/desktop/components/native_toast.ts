import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import notifier, { type Notifier, type NotificationOptions } from "toasted-notifier";
import { AppConfig, ToastConfig } from "config";
import type {
  NativeToastCapabilities, NativeToastOptions, NativeToastResult,
} from "shared/native-toast";
import type { DesktopEvents } from "../events";

function toastCapabilities(platform = process.platform): NativeToastCapabilities {
  return { platform, actions: platform === "win32" || platform === "darwin" };
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    throw new Error(`Toast ${field} must be a non-empty string`);
  return value;
}

function parseOptions(value: unknown): NativeToastOptions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Toast options must be an object");
  const input = value as Record<string, unknown>;
  const options: NativeToastOptions = { message: text(input.message, "message") };
  if (input.title !== undefined) options.title = text(input.title, "title");
  if (input.sound !== undefined) {
    if (typeof input.sound !== "boolean") throw new Error("Toast sound must be a boolean");
    options.sound = input.sound;
  }
  if (input.timeout !== undefined) {
    if (typeof input.timeout !== "number" || !Number.isFinite(input.timeout) || input.timeout <= 0)
      throw new Error("Toast timeout must be a positive number of seconds");
    options.timeout = input.timeout;
  }
  if (input.actions !== undefined) {
    if (!Array.isArray(input.actions) || input.actions.length > 5)
      throw new Error("Toast actions must be an array of up to five buttons");
    const ids = new Set<string>();
    const labels = new Set<string>();
    options.actions = input.actions.map((action: unknown) => {
      if (!action || typeof action !== "object") throw new Error("Invalid toast action");
      const { id, label } = action as Record<string, unknown>;
      const button = { id: text(id, "action id"), label: text(label, "action label") };
      const key = button.label.toLowerCase();
      if (ids.has(button.id) || labels.has(key) || /[;,]/.test(button.label))
        throw new Error("Toast actions need unique ids and labels without commas or semicolons");
      ids.add(button.id);
      labels.add(key);
      return button;
    });
  }
  return options;
}

function resultFor(options: NativeToastOptions, response: string | undefined, metadata: Record<string, unknown> = {}, platform = process.platform): NativeToastResult {
  // The library lowercases response strings. Prefer native metadata so button
  // labels keep their spelling and cannot be confused with click/timeout events.
  const event = String(metadata.action ?? response ?? metadata.activationType ?? "").toLowerCase();
  const systemEvent = ["activate", "activated", "clicked", "click", "timeout", "timedout", "dismissed", "closed", "close", "hidden"].includes(event);
  const label = metadata.button ?? metadata.activationValue ?? (systemEvent ? undefined : metadata.activationType ?? response);
  const action = options.actions?.find((button) =>
    typeof label === "string" && button.label.toLowerCase() === label.toLowerCase(),
  );
  if (action) return { event: "action", action: action.id };
  if (["activate", "activated", "clicked", "click"].includes(event)) return { event: "click", action: null };
  if (["timeout", "timedout"].includes(event)) return { event: "timeout", action: null };
  if (["dismissed", "closed", "close", "hidden"].includes(event)) return { event: "dismissed", action: null };
  return { event: !response && !Object.keys(metadata).length && platform === "linux" ? "sent" : "unknown", action: null };
}

async function nativeBackend(): Promise<Notifier> {
  let customPath: string | undefined;
  if (process.platform === "win32" || process.platform === "darwin") {
    const root = Bun.isStandaloneExecutable
      ? join(dirname(process.execPath), "native", "toast", process.platform)
      : join(dirname(fileURLToPath(import.meta.resolve("toasted-notifier"))), "vendor");
    customPath = process.platform === "win32"
      ? join(root, Bun.isStandaloneExecutable ? "" : "ntfyToast", "ntfytoast.exe")
      : join(root, Bun.isStandaloneExecutable ? "" : "mac.noindex", "terminal-notifier.app", "Contents", "MacOS", "terminal-notifier");
    if (!(await Bun.file(customPath).exists()))
      throw new Error(`Native toast helper is missing: ${customPath}. Ship the native/toast folder with the executable.`);
  }
  // A Linux app under WSL still needs the Linux backend. The package's automatic
  // WSL detection selects a Windows .exe that isn't part of the Linux package.
  const Backend = process.platform === "linux" ? notifier.NotifySend : notifier.Notification;
  return new Backend({ withFallback: false, customPath });
}

/** A backend can be injected for tests; normal calls use toasted-notifier. */
function createNativeToast(
  backend = nativeBackend,
  platform = process.platform,
) {
  return async (input: unknown): Promise<NativeToastResult> => {
    const options = parseOptions(input);
    if (options.actions?.length && !toastCapabilities(platform).actions)
      throw new Error("toasted-notifier does not support action buttons on this platform");
    const native = await backend();
    const request: NotificationOptions = {
      title: options.title ?? AppConfig.appName,
      message: options.message,
      sound: options.sound ?? ToastConfig.defaults.sound,
      timeout: options.timeout ?? ToastConfig.defaults.timeout,
      ...(options.actions?.length ? { actions: options.actions.map((action) => action.label) } : {}),
      ...(platform === "win32" && ToastConfig.windowsAppId ? { appID: ToastConfig.windowsAppId } : {}),
      ...(platform === "linux" ? { "app-name": AppConfig.appName } : {}),
    };
    return new Promise((resolve, reject) => {
      native.notify(request, (error, response, metadata) => {
        if (error) reject(error instanceof Error ? error : new Error(String(error)));
        else resolve(resultFor(options, response, metadata, platform));
      });
    });
  };
}

const showNativeToast = createNativeToast();

export default {
  register(events: DesktopEvents): void {
    events.on("native:toast", showNativeToast);
    events.on("native:toast:capabilities", () => toastCapabilities());
  },

  show: showNativeToast,
  capabilities: toastCapabilities,
  create: createNativeToast,
};

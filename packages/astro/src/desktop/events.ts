import {
  DESKTOP_EVENT_BINDING,
  type DesktopBridge,
  type DesktopEventRequest,
  type DesktopEventResponse,
} from "shared/desktop-events";

export interface SendEventOptions {
  timeoutMs?: number;
}

/** Await a native desktop operation. Safe to import during SSR; calls require the host. */
export async function sendEvent<TResult = unknown>(
  type: string,
  data?: unknown,
  options: SendEventOptions = {},
): Promise<TResult> {
  if (!type.trim()) throw new Error("Desktop event type must not be empty");
  const bridge =
    typeof window === "undefined"
      ? undefined
      : (window as Window & { webui?: DesktopBridge }).webui;
  if (!bridge?.isConnected()) {
    throw new Error("This action requires the connected desktop host.");
  }
  const request: DesktopEventRequest = { type, data: data ?? null };
  const json = JSON.stringify(request);
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
  ) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = bridge.call(DESKTOP_EVENT_BINDING, json);
    // Native dialogs may stay open while the user decides; timeouts are opt-in.
    const reply =
      options.timeoutMs === undefined
        ? await pending
        : await Promise.race([
            pending,
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error(`Desktop event timed out: ${type}`)),
                options.timeoutMs,
              );
            }),
          ]);
    const response = JSON.parse(reply) as DesktopEventResponse<TResult>;
    if (!response || typeof response.ok !== "boolean")
      throw new Error("Invalid desktop event response");
    if (!response.ok) {
      const error = new Error(response.error.message);
      error.name = response.error.name;
      throw error;
    }
    return response.data;
  } finally {
    clearTimeout(timeout);
  }
}

export type SendEvent = typeof sendEvent;

/** Listen to a pushed browser event. Safe to import/use during SSR. */
export function onDesktopEvent<T = unknown>(name: string, handler: (detail: T) => void): () => void {
  if (!name.trim()) throw new Error("Window event name must not be empty");
  if (typeof window === "undefined") return () => {};
  const receive = (event: Event) => handler((event as CustomEvent<T>).detail);
  window.addEventListener(name, receive);
  return () => window.removeEventListener(name, receive);
}

/** WebUI already correlates calls and replies; one binding carries our JSON messages. */
export const DESKTOP_EVENT_BINDING = "desktop_event";

export interface DesktopBridge {
  call(name: string, ...args: (string | number | boolean)[]): Promise<string>;
  isConnected(): boolean;
  setEventCallback(callback: (event: number) => void): void;
}

export interface DesktopEventRequest {
  type: string;
  data: unknown;
}

export type DesktopEventResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { name: string; message: string } };

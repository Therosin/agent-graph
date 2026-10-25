/** JSON-only requests and results for the native:toast desktop event. */
export interface NativeToastAction {
  id: string;
  label: string;
}

export interface NativeToastOptions {
  message: string;
  title?: string;
  actions?: NativeToastAction[];
  sound?: boolean;
  /** Seconds; native platforms may round this to their supported durations. */
  timeout?: number;
}

export interface NativeToastResult {
  event: "action" | "click" | "dismissed" | "timeout" | "sent" | "unknown";
  action: string | null;
}

export interface NativeToastCapabilities {
  platform: string;
  actions: boolean;
}

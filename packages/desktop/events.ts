import {
  DESKTOP_EVENT_BINDING,
  type DesktopEventRequest,
  type DesktopEventResponse,
} from "shared/desktop-events";

/** respondWith must be called during dispatch; it may receive a promise. */
export class DesktopRequestEvent<T = unknown> extends Event {
  private response?: Promise<unknown>;

  constructor(
    type: string,
    readonly data: T,
  ) {
    super(type);
  }

  respondWith(result: unknown | PromiseLike<unknown>): void {
    if (this.response)
      throw new Error(`Desktop event already has a responder: ${this.type}`);
    this.response = Promise.resolve(result);
  }

  get result(): Promise<unknown> {
    return (
      this.response ??
      Promise.reject(
        new Error(`No desktop handler registered for "${this.type}"`),
      )
    );
  }
}

/** An EventTarget with one result-producing handler per named request. */
export class DesktopEvents extends EventTarget {
  private handlers = new Map<string, EventListener>();

  on<TData = unknown, TResult = unknown>(
    type: string,
    handler: (data: TData) => TResult | Promise<TResult>,
  ): () => void {
    if (!type.trim()) throw new Error("Desktop event type must not be empty");
    if (this.handlers.has(type))
      throw new Error(`Desktop handler already registered for "${type}"`);
    const listener: EventListener = (event) => {
      if (!(event instanceof DesktopRequestEvent)) return;
      try {
        event.respondWith(handler(event.data as TData));
      } catch (error) {
        event.respondWith(Promise.reject(error));
      }
    };
    this.handlers.set(type, listener);
    this.addEventListener(type, listener);
    return () => {
      if (this.handlers.get(type) !== listener) return;
      this.removeEventListener(type, listener);
      this.handlers.delete(type);
    };
  }

  async emit<TResult = unknown>(
    type: string,
    data?: unknown,
  ): Promise<TResult> {
    const event = new DesktopRequestEvent(type, data);
    this.dispatchEvent(event);
    return (await event.result) as TResult;
  }

  /** The wire boundary: callers and handlers work with objects, not JSON strings. */
  async receive(json: string): Promise<string> {
    try {
      const request: unknown = JSON.parse(json);
      if (
        !request ||
        typeof request !== "object" ||
        Array.isArray(request) ||
        !("type" in request) ||
        typeof request.type !== "string" ||
        !request.type.trim()
      ) {
        throw new Error("Desktop event requires a non-empty type");
      }
      const { type, data } = request as DesktopEventRequest;
      const result = await this.emit(type, data);
      const response: DesktopEventResponse = { ok: true, data: result ?? null };
      return JSON.stringify(response);
    } catch (error) {
      const response: DesktopEventResponse = {
        ok: false,
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
      };
      return JSON.stringify(response);
    }
  }
}

interface BindingEvent {
  arg: { string(index: number): string };
}
interface DesktopBinding {
  bind(name: string, handler: (event: BindingEvent) => Promise<string>): void;
}

export function bindDesktopEvents(
  window: DesktopBinding,
  events: DesktopEvents,
): void {
  window.bind(DESKTOP_EVENT_BINDING, (event) =>
    events.receive(event.arg.string(0)),
  );
}

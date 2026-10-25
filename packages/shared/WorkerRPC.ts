type Handler = (data: any) => unknown | Promise<unknown>;
type UpdateHandler = (dt: number) => void | Promise<void>;

type Packet =
  | { kind: "init"; data: unknown; shared: unknown }
  | { kind: "ready" }
  | { kind: "call"; id: string; event: string; data: unknown }
  | { kind: "reply"; id: string; data?: unknown; error?: string }
  | { kind: "tick"; dt: number };

type Transport = {
  postMessage(message: Packet): void;
  addEventListener(
    type: "message",
    handler: (event: MessageEvent<Packet>) => void,
  ): void;
};

export type WorkerConfig<
  Data = unknown,
  Shared = Record<string, SharedArrayBuffer>,
> = WorkerOptions & {
  data?: Data;
  shared?: Shared;
};

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class Channel<
  Data = unknown,
  Shared = Record<string, SharedArrayBuffer>,
> {
  private handlers = new Map<string, Handler>();
  private pending = new Map<string, Pending>();
  private queue: Packet[] = [];

  private updateHandlers = new Set<UpdateHandler>();
  private lastLocalTick = performance.now();
  private lastRemoteTick?: number;
  private closed = false;

  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;

  readonly ready: Promise<void>;

  data!: Data;
  shared!: Shared;

  readonly timing = {
    dt: 0,
    interval: 0,
    drift: 0,
    ticks: 0,
    lastUpdate: 0,
  };

  constructor(
    protected transport: Transport,
    private manualUpdate = false,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Closing during startup must not leave an unobserved rejection.
    void this.ready.catch(() => {});

    transport.addEventListener("message", (event) => {
      const packet = event.data;

      // Only incoming calls need main-thread dispatch.
      // Replies and protocol messages are handled immediately.
      if (this.manualUpdate && packet.kind === "call") {
        this.queue.push(packet);
      } else {
        void this.dispatch(packet);
      }
    });
  }

  On(event: string, handler: Handler): () => void {
    this.handlers.set(event, handler);

    return () => {
      if (this.handlers.get(event) === handler) {
        this.handlers.delete(event);
      }
    };
  }

  OnUpdate(handler: UpdateHandler): () => void {
    this.updateHandlers.add(handler);

    return () => this.updateHandlers.delete(handler);
  }

  async Emit<T = unknown>(
    event: string,
    data?: unknown,
    timeoutMs = 10_000,
  ): Promise<T> {
    await this.ready;

    if (this.closed) {
      throw new Error("Worker channel is closed");
    }

    const id = crypto.randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Worker RPC timed out: ${event}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });

      try {
        this.transport.postMessage({
          kind: "call",
          id,
          event,
          data,
        });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(this.toError(error));
      }
    });
  }

  update(dt?: number): void {
    if (this.closed || !this.manualUpdate) return;

    const now = performance.now();
    const elapsed = dt ?? now - this.lastLocalTick;
    this.lastLocalTick = now;

    // Snapshot the inbox, leaving newly arriving
    // messages for the next update.
    const messages = this.queue.splice(0);

    for (const message of messages) {
      void this.dispatch(message);
    }

    // Forward timing information to the worker.
    this.transport.postMessage({
      kind: "tick",
      dt: elapsed,
    });
  }

  protected initialize(data: Data, shared: Shared): void {
    this.data = data;
    this.shared = shared;
  }

  protected sendInit(): void {
    this.transport.postMessage({
      kind: "init",
      data: this.data,
      shared: this.shared,
    });
  }

  protected completeReady(): void {
    this.resolveReady();
  }

  protected fail(error: Error): void {
    if (this.closed) return;

    this.closed = true;
    this.rejectReady(error);

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }

    this.pending.clear();
    this.queue.length = 0;
  }

  private toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
  }

  private async dispatch(packet: Packet): Promise<void> {
    if (this.closed) return;

    switch (packet.kind) {
      case "init": {
        this.initialize(packet.data as Data, packet.shared as Shared);

        this.transport.postMessage({ kind: "ready" });
        this.completeReady();
        break;
      }

      case "ready": {
        this.completeReady();
        break;
      }

      case "tick": {
        const now = performance.now();

        const interval =
          this.lastRemoteTick === undefined
            ? packet.dt
            : now - this.lastRemoteTick;

        this.timing.dt = packet.dt;
        this.timing.interval = interval;
        this.timing.drift = interval - packet.dt;
        this.timing.lastUpdate = now;
        this.timing.ticks++;

        this.lastRemoteTick = now;

        for (const handler of this.updateHandlers) {
          try {
            void Promise.resolve(handler(packet.dt)).catch(console.error);
          } catch (error) {
            console.error(error);
          }
        }

        break;
      }

      case "reply": {
        const pending = this.pending.get(packet.id);
        if (!pending) return;

        this.pending.delete(packet.id);
        clearTimeout(pending.timeout);

        if (packet.error !== undefined) {
          pending.reject(new Error(packet.error));
        } else {
          pending.resolve(packet.data);
        }

        break;
      }

      case "call": {
        const handler = this.handlers.get(packet.event);

        try {
          if (!handler) {
            throw new Error(`No handler registered for "${packet.event}"`);
          }

          const result = await handler(packet.data);

          this.transport.postMessage({
            kind: "reply",
            id: packet.id,
            data: result,
          });
        } catch (error) {
          this.transport.postMessage({
            kind: "reply",
            id: packet.id,
            error: this.toError(error).message,
          });
        }

        break;
      }
    }
  }
}

// --------------------------------------------------
// Worker lifecycle
// --------------------------------------------------

let parentChannel: Channel<any, any> | undefined;

export default class Worker<
  Data = unknown,
  Shared = Record<string, SharedArrayBuffer>,
> extends Channel<Data, Shared> {
  private native: globalThis.Worker;

  constructor(path: string | URL, options: WorkerConfig<Data, Shared> = {}) {
    const { data, shared, ...nativeOptions } = options;

    const native = new globalThis.Worker(path, nativeOptions);

    super(native, true);
    this.native = native;

    this.initialize(data as Data, shared as Shared);

    native.addEventListener("error", (event) => {
      this.fail(new Error(event.message));
    });

    this.sendInit();
  }

  static get Parent(): Channel<any, any> {
    if (!parentChannel) {
      parentChannel = new Channel<any, any>(
        globalThis as unknown as Transport,
        false,
      );
    }

    return parentChannel;
  }

  terminate(): void {
    this.fail(new Error("Worker terminated"));
    this.native.terminate();
  }
}

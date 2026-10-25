import { afterEach, expect, test } from "bun:test";
import Worker from "../packages/shared/WorkerRPC";

const workers: Worker[] = [];
function worker() {
  const instance = new Worker(
    new URL("./fixtures/rpc-worker.ts", import.meta.url),
    { shared: { metrics: new SharedArrayBuffer(4) } },
  );
  workers.push(instance);
  return instance;
}
afterEach(() => {
  workers.splice(0).forEach((worker) => worker.terminate());
});

test("worker handshake, replies, errors, and shared memory", async () => {
  const instance = worker();
  await instance.ready;
  expect(await instance.Emit("echo", { nested: [1, 2] })).toEqual({
    nested: [1, 2],
  });
  expect(
    await instance.Emit("throw").catch((error) => error.message),
  ).toContain("worker failure");
  expect(
    await instance.Emit("missing").catch((error) => error.message),
  ).toContain("No handler registered");
  await instance.Emit("shared");
  expect(Atomics.load(new Int32Array(instance.shared.metrics), 0)).toBe(1);
});

test("parent calls wait for update, while ordinary replies keep flowing", async () => {
  const instance = worker();
  let called = false;
  instance.On("parent-value", () => {
    called = true;
    return 42;
  });
  const pending = instance.Emit("ask-parent");
  await instance.Emit("echo"); // proves the worker has received the preceding request
  expect(called).toBe(false);
  const pump = setInterval(() => instance.update(16), 5);
  try {
    expect(await pending).toBe(42);
    const timing = await instance.Emit<{ dt: number; ticks: number }>("timing");
    expect(timing.dt).toBe(16);
    expect(timing.ticks).toBeGreaterThan(0);
  } finally {
    clearInterval(pump);
  }
});

test("RPC requests time out and termination rejects in-flight calls", async () => {
  const instance = worker();
  expect(
    await instance.Emit("never", undefined, 30).catch((error) => error.message),
  ).toContain("timed out");
  const pending = instance.Emit("never").catch((error) => error.message);
  await Bun.sleep(10);
  instance.terminate();
  expect(await pending).toContain("Worker terminated");
});

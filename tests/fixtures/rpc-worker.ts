import Worker from "../../packages/shared/WorkerRPC";
const parent = Worker.Parent;
await parent.ready;
parent.On("echo", (value) => value);
parent.On("throw", () => {
  throw new Error("worker failure");
});
parent.On("never", () => new Promise(() => {}));
parent.On("shared", () =>
  Atomics.add(new Int32Array(parent.shared.metrics), 0, 1),
);
parent.On("ask-parent", () => parent.Emit("parent-value"));
parent.On("timing", () => parent.timing);

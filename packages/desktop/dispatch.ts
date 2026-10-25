/** Push JSON data into the current document; no browser listener result is awaited. */
export function createWindowDispatcher(window: { run(script: string): void }) {
  return (name: string, detail?: unknown): void => {
    if (typeof name !== "string" || !name.trim())
      throw new Error("Window event name must not be empty");
    const json = JSON.stringify(detail ?? null);
    if (json === undefined) throw new Error("Window event detail must be JSON serializable");
    // Parse data in the page rather than interpolating it as a JavaScript object
    // literal (which treats keys such as __proto__ differently from JSON).
    window.run(`window.dispatchEvent(new CustomEvent(${JSON.stringify(name)}, { detail: JSON.parse(${JSON.stringify(json)}) }));`);
  };
}

export type WindowDispatcher = ReturnType<typeof createWindowDispatcher>;

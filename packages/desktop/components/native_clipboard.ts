import clipboard from "clipboardy";
import type { DesktopEvents } from "../events";

async function linuxClipboard(write?: string): Promise<string> {
  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  const command = wayland
    ? write === undefined ? ["wl-paste", "--no-newline", "--type", "text"] : ["wl-copy", "--type", "text/plain;charset=utf-8"]
    : write === undefined ? ["xsel", "--clipboard", "--output"] : ["xsel", "--clipboard", "--input"];
  const child = Bun.spawn(command, {
    stdin: write === undefined ? "ignore" : new Blob([write]),
    // Clipboard owners fork. Their inherited pipes must not hold our request open.
    stdout: write === undefined ? "pipe" : "ignore",
    stderr: write === undefined ? "pipe" : "inherit",
  });
  const output = write === undefined ? new Response(child.stdout).text() : Promise.resolve("");
  const [code, text, error] = await Promise.all([child.exited, output, write === undefined ? new Response(child.stderr).text() : Promise.resolve("")]);
  if (code === 1 && /nothing is copied|no selection|no suitable type|clipboard is empty|target STRING not available/i.test(error)) return "";
  if (code !== 0) throw new Error(`${error.trim() || `Clipboard tool ${command[0]} failed (${code})`}. Install ${wayland ? "wl-clipboard" : "xsel"} and use a desktop session.`);
  return text;
}

async function readText(): Promise<string> {
  return process.platform === "linux" ? linuxClipboard() : clipboard.read();
}

async function writeText(text: string): Promise<void> {
  if (typeof text !== "string") throw new Error("Clipboard text must be a string");
  if (process.platform === "linux") await linuxClipboard(text);
  else await clipboard.write(text);
}

export default {
  register(events: DesktopEvents): void {
    events.on("native:clipboard:read", readText);
    events.on<{ text: string }>("native:clipboard:write", (request) => writeText(request?.text));
  },
  readText,
  writeText,
};

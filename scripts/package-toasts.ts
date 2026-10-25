import { chmod, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Only the helper for the build target is distributed; Linux uses notify-send. */
export async function stageToastHelpers(os: string, stage: string, output: string) {
  if (os === "linux") return;
  const desktop = fileURLToPath(new URL("../packages/desktop/", import.meta.url));
  const vendor = join(dirname(Bun.resolveSync("toasted-notifier", desktop)), "vendor");
  const platform = os === "windows" ? "win32" : "darwin";
  const destination = join(stage, "native", "toast", platform);
  await mkdir(destination, { recursive: true });
  if (os === "windows") {
    await cp(join(vendor, "ntfyToast"), destination, { recursive: true });
  } else if (os === "darwin") {
    const app = join(destination, "terminal-notifier.app");
    await cp(join(vendor, "mac.noindex", "terminal-notifier.app"), app, { recursive: true });
    await chmod(join(app, "Contents", "MacOS", "terminal-notifier"), 0o755);
    await cp(join(vendor, "terminal-notifier-LICENSE"), join(destination, "terminal-notifier-LICENSE"));
  } else throw new Error(`Unsupported toast helper target: ${os}`);
  await cp(join(vendor, "..", "LICENSE.md"), join(destination, "toasted-notifier-LICENSE.md"));
  await cp(destination, join(output, "native", "toast", platform), { recursive: true });
  console.log(`Native toast helper: ${join(output, "native", "toast", platform)}`);
}

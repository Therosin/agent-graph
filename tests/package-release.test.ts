import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { AppConfig } from "../packages/config/config";
import { packageRelease } from "../scripts/package-release";

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });

async function fixture(os: "windows" | "linux") {
  const root = await mkdtemp(join(tmpdir(), "astro-release-test-"));
  temporary.push(root);
  const platform = os === "windows" ? "win32" : "linux";
  const archive = os === "windows" ? "webui-windows-msvc-x64" : "webui-linux-gcc-x64";
  const executable = `${AppConfig.id}-${os}-x64${os === "windows" ? ".exe" : ""}`;
  const files = {
    [`build/${executable}`]: "test executable",
    [`build/${archive}/${os === "windows" ? "webui-2.dll" : "libwebui-2.so"}`]: "native WebUI",
    [`build/${archive}/LICENSE`]: "WebUI notice",
    [`build/native/dialogs/${platform}/x64/${os === "windows" ? "nfd.dll" : "libnfd.so"}`]: "dialog library",
    [`build/native/dialogs/${platform}/x64/LICENSE`]: "dialog notice",
    "build/private.env": "must not ship",
    "build/native/dialogs/other-platform/secret": "must not ship",
    "docs/Packaging.md": "Package instructions",
    ...(os === "windows" ? { "build/native/toast/win32/snoretoast.exe": "toast helper", "build/native/toast/win32/LICENSE.md": "toast notice" } : {}),
  };
  for (const [path, content] of Object.entries(files)) await Bun.write(join(root, path), content);
  return { root, archive, executable };
}

test("Windows release ZIP includes target helpers and notices without other build files", async () => {
  const { root, archive, executable } = await fixture("windows");
  const path = await packageRelease(["--target=bun-windows-x64"], root);
  const zip = new AdmZip(path);
  const entries = zip.getEntries().map(entry => entry.entryName);
  for (const name of [executable, `${archive}/webui-2.dll`, `${archive}/LICENSE`, "native/dialogs/win32/x64/nfd.dll", "native/dialogs/win32/x64/LICENSE", "native/toast/win32/snoretoast.exe", "native/toast/win32/LICENSE.md", "README.txt"])
    expect(entries).toContain(`${AppConfig.id}/${name}`);
  expect(entries.some(name => name.includes("private.env") || name.includes("other-platform"))).toBe(false);
  const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
  expect(await Bun.file(path + ".sha256").text()).toBe(`${digest}  ${AppConfig.id}-windows-x64.zip\n`);
});

test("Linux release tarball contains the executable and Linux libraries", async () => {
  const { root, executable } = await fixture("linux");
  const path = await packageRelease(["--target=bun-linux-x64"], root);
  const listing = Bun.spawn(["tar", "-tzf", path], { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(listing.stdout).text();
  expect(await listing.exited).toBe(0);
  expect(output).toContain(`${AppConfig.id}/${executable}`);
  expect(output).toContain(`${AppConfig.id}/native/dialogs/linux/x64/libnfd.so`);
  expect(output).not.toContain("private.env");
  expect(output).not.toContain("other-platform");
});

test("missing offline native assets fail before creating a distributable", async () => {
  const root = await mkdtemp(join(tmpdir(), "astro-release-test-"));
  temporary.push(root);
  await mkdir(join(root, "build"));
  await expect(packageRelease(["--target=bun-windows-x64"], root)).rejects.toThrow("Missing release asset");
});

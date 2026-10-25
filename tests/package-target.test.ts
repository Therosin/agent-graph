import { expect, test } from "bun:test";
import { packageTarget, packageOptions } from "../scripts/package-target";
import { AppConfig } from "../packages/config/config";

test("offline native archives follow the build target rather than the build host", () => {
  expect(packageTarget("bun-windows-arm64")).toMatchObject({
    archive: "webui-windows-msvc-arm64",
    library: "webui-2.dll",
  });
  expect(packageTarget("bun-linux-x64")).toMatchObject({
    archive: "webui-linux-gcc-x64",
    library: "libwebui-2.so",
  });
  expect(packageTarget("bun-darwin-arm64")).toMatchObject({
    archive: "webui-macos-clang-arm64",
    library: "libwebui-2.dylib",
  });
  expect(() => packageTarget("bun-linux-x64-musl")).toThrow(
    "Unsupported desktop target",
  );
});

test("build options select target-specific filenames and opt-in offline libraries", () => {
  expect(
    packageOptions(["--target=bun-windows-arm64", "--offline"]),
  ).toMatchObject({
    offline: true,
    executable: `${AppConfig.id}-windows-arm64.exe`,
  });
  expect(
    packageOptions(["--target", "bun-linux-x64", "--console"]),
  ).toMatchObject({
    offline: false,
    console: true,
    executable: `${AppConfig.id}-linux-x64`,
  });
  expect(() => packageOptions(["--target"])).toThrow("requires");
  expect(() => packageOptions(["--unexpected"])).toThrow("Unknown");
});

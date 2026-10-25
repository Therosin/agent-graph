import { expect, test } from "bun:test";
import { AppConfig, WindowConfig, BackendConfig } from "../packages/config/config";
import { defaultWindowSettings } from "../packages/shared/contracts";
import { loadBuildConfig } from "../scripts/build-config";
import { packageOptions } from "../scripts/package-target";

test("editable source config supplies shared window defaults", () => {
  expect(AppConfig.appName).toBeTruthy();
  expect(AppConfig.buildTime).toBeNull();
  expect(WindowConfig.defaults.title).toBe(AppConfig.appName);
  expect(defaultWindowSettings).toBe(WindowConfig.defaults);
});

test("build defines override identity and partial defaults without replacing other defaults", async () => {
  const options = packageOptions([
    "--define", 'APP_ID="config-test"',
    "--define", 'APP_NAME="Config Test"',
    '--define=APP_VERSION="1.2.3"',
    "--define", 'APP_DESCRIPTION="A separate application"',
    "--define", 'BUILD_TIME="2026-10-24T12:00:00Z"',
    "--define", 'WINDOW_DEFAULTS={"transparent":false}',
    "--define", 'BACKEND_DEFAULTS={"port":0}',
  ]);
  const configured = await loadBuildConfig(options.define);
  expect(configured.AppConfig).toEqual({
    id: "config-test", appName: "Config Test", appVersion: "1.2.3",
    appDescription: "A separate application", buildTime: "2026-10-24T12:00:00Z",
  });
  expect(configured.WindowConfig.defaults).toEqual({
    ...WindowConfig.defaults, title: "Config Test", transparent: false,
  });
  expect(configured.TrayConfig.defaults.tooltip).toBe("Config Test");
  expect(configured.BackendConfig.defaults).toEqual({ ...BackendConfig.defaults, port: 0 });
  expect(packageOptions(["--target=bun-linux-x64"], configured.AppConfig.id).executable)
    .toBe("config-test-linux-x64");
});

test("invalid define values and application ids fail before building", () => {
  expect(() => packageOptions(["--define"])).toThrow("NAME=JSON");
  expect(() => packageOptions(["--define", "APP_NAME=unquoted"])).toThrow("JSON");
  expect(() => packageOptions(["--define", '=true'])).toThrow("NAME=JSON");
  expect(() => packageOptions([], "../outside")).toThrow("filename-safe");
});

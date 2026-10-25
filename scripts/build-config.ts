import { fileURLToPath } from "node:url";
import type { BunPlugin } from "bun";
import * as defaults from "../packages/config/config";

const configPath = fileURLToPath(new URL("../packages/config/config.ts", import.meta.url));

/** One serializable define map shared by Bun builds and Astro's build process. */
export function parseDefine(argument: string): [string, string] {
  const separator = argument.indexOf("=");
  const name = argument.slice(0, separator);
  if (
    separator < 1 ||
    !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name)
  )
    throw new Error("--define requires NAME=JSON (for example APP_VERSION=\"1.2.3\")");
  try {
    return [name, JSON.stringify(JSON.parse(argument.slice(separator + 1)))];
  } catch {
    throw new Error(`Define ${name} must be a JSON value; quote string values`);
  }
}

// Overrides are a build concern. config.ts remains ordinary editable data.
export function loadBuildConfig(define: Record<string, string>) {
  const value = <T>(name: string, fallback: T): T =>
    name in define ? JSON.parse(define[name]!) : fallback;
  const AppConfig = {
    ...defaults.AppConfig,
    id: value("APP_ID", defaults.AppConfig.id),
    appName: value("APP_NAME", defaults.AppConfig.appName),
    appVersion: value("APP_VERSION", defaults.AppConfig.appVersion),
    appDescription: value("APP_DESCRIPTION", defaults.AppConfig.appDescription),
    buildTime: value<string | null>("BUILD_TIME", null),
  };
  return {
    ...defaults,
    AppConfig,
    TrayConfig: { ...defaults.TrayConfig, defaults: {
      ...defaults.TrayConfig.defaults,
      tooltip: defaults.TrayConfig.defaults.tooltip === defaults.AppConfig.appName
        ? AppConfig.appName : defaults.TrayConfig.defaults.tooltip,
    } },
    WindowConfig: { ...defaults.WindowConfig, defaults: {
      ...defaults.WindowConfig.defaults,
      // Follow an overridden app name unless the template has a custom title.
      title: defaults.WindowConfig.defaults.title === defaults.AppConfig.appName
        ? AppConfig.appName : defaults.WindowConfig.defaults.title,
      ...value("WINDOW_DEFAULTS", {}),
    } },
    DesktopConfig: { ...defaults.DesktopConfig, defaults: { ...defaults.DesktopConfig.defaults, ...value("DESKTOP_DEFAULTS", {}) } },
    BackendConfig: { ...defaults.BackendConfig, defaults: { ...defaults.BackendConfig.defaults, ...value("BACKEND_DEFAULTS", {}) } },
    FrontendConfig: { ...defaults.FrontendConfig, defaults: { ...defaults.FrontendConfig.defaults, ...value("FRONTEND_DEFAULTS", {}) } },
  };
}

/** Share the resolved data with Bun and Vite without modifying config.ts. */
export function buildConfigModule(define: Record<string, string>) {
  const config = loadBuildConfig(define);
  return Object.entries(config)
    .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
    .join("\n");
}

export function isConfigModule(path: string) {
  return path.split("?")[0]!.replaceAll("\\", "/") === configPath.replaceAll("\\", "/");
}

export function configBuildPlugin(define: Record<string, string>): BunPlugin {
  return {
    name: "application-config",
    setup(build) {
      build.onLoad({ filter: /[\\/]config[\\/]config\.ts$/ }, ({ path }) => {
        if (isConfigModule(path)) return { contents: buildConfigModule(define), loader: "js" };
      });
    },
  };
}

/** Serializable contracts only: safe to import from the frontend or either Bun thread. */
import { WindowConfig } from "config";

export interface WindowSettings {
  title: string;
  transparent: boolean;
  minimisable: boolean;
  maximisable: boolean;
  closeable: boolean;
  resizable: boolean;
}

// Retain the shared contract's existing import for consumers.
export const defaultWindowSettings: WindowSettings = WindowConfig.defaults;

export type WindowCommand = "minimize" | "maximize" | "close";

export function parseWindowSettings(value: unknown): Partial<WindowSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Window settings must be an object");
  const patch: Partial<WindowSettings> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === "title" && typeof field === "string" && field.length <= 200)
      patch.title = field;
    else if (
      key !== "title" &&
      Object.hasOwn(defaultWindowSettings, key) &&
      typeof field === "boolean"
    )
      Object.assign(patch, { [key]: field });
    else throw new Error(`Invalid window setting: ${key}`);
  }
  return patch;
}

export interface BackendConfig {
  host?: string;
  port: number;
  assetsDir: string;
  bridgeOrigin?: string;
}
export interface SharedMetrics {
  metrics: SharedArrayBuffer;
}
export interface BackendStatus {
  ok: true;
  app: Omit<typeof import("config").AppConfig, "buildTime"> & {
    buildTime: string | null;
  };
  uptime: number;
  requests: number;
}
export interface BackendInfo {
  origin: string;
}

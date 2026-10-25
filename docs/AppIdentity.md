# Application identity and defaults

When you turn the template into an app, start in [packages/config/config.ts](../packages/config/config.ts). It is the central, editable description of the application you are making. Workspace package names describe the repository's packages; changing a `package.json` name does not rename the application window.

## Give the app a name

Edit the existing constants at the top of the file:

```ts
const APP_ID = "field-notes";
const APP_NAME = "Field Notes";
const APP_VERSION = "0.1.0";
const APP_DESCRIPTION = "A notebook for projects and ideas";
```

The exported `AppConfig` already uses these values. They flow into frontend branding and metadata, native window defaults, backend status, tray defaults, and executable metadata. You can keep the workspace package names unchanged while making an entirely different application.

Choose a stable `APP_ID` using lowercase letters, digits, dots, underscores, or hyphens, starting with a letter or digit. It becomes the executable basename and identifies your application directories. Changing it later also changes where [Desktop tools](DesktopTools.md) resolves application storage.

Restart desktop development after config changes, and rebuild before distributing. That keeps the frontend, host, and worker on the same identity.

## Choose the initial window

Edit the existing `WindowConfig.defaults` object for window settings:

```ts
export const WindowConfig = {
  defaults: {
    title: APP_NAME,
    transparent: false,
    minimisable: true,
    maximisable: true,
    closeable: true,
    resizable: true,
  },
};
```

Window dimensions and startup presentation belong in `DesktopConfig.defaults`: `width`, `height`, `minWidth`, `minHeight`, `frameless`, and `centered`. For example, a small utility might start at 800 × 600 while keeping the supplied minimum dimensions.

These are starting values. Live window settings belong to the AppSettings store and native controller; changing the config does not provide a saved user preferences system. See [App shell](AppShell.md) to update settings while the app is running.

## Find the other defaults

The rest of the file follows the same plain-object pattern. Edit the existing object you need rather than scattering duplicate defaults across packages.

| Export | What you customize |
| --- | --- |
| `BackendConfig.defaults` | Backend host and HTTP port. |
| `FrontendConfig.defaults` | Astro development host and port. |
| `ToastConfig.defaults` | Notification sound and timeout; seconds are used for the timeout. |
| `ToastConfig.windowsAppId` | Your installer-registered Windows notification identity, when you have one. |
| `ShellConfig.defaults` | Allowed external URL schemes. |
| `TrayConfig.defaults` | Whether the tray starts, its tooltip, and its initial menu. |
| `TrayConfig.icons` | Platform-specific tray icon files or a Linux theme icon name. |

Import the exported values wherever your app needs them:

```ts
import { AppConfig } from "config";

const aboutText = `${AppConfig.appName} ${AppConfig.appVersion}`;
```

The `config` workspace dependency is already available to the frontend, desktop, and backend. Put any new shared defaults here as ordinary exported constants. Keep user-editable values easy to find.

## Override identity for a particular build

Most projects can just edit the file. For release automation or a special build, the root build command also accepts JSON-valued overrides:

```sh
bun run build --offline --define 'APP_NAME="Field Notes Preview"' --define 'APP_VERSION="0.2.0"'
bun run build --define 'WINDOW_DEFAULTS={"transparent":false}'
```

Pass each `NAME=JSON` as one shell argument. Strings include the inner double quotes; partial defaults keep unspecified values from the file. Supported config overrides are `APP_ID`, `APP_NAME`, `APP_VERSION`, `APP_DESCRIPTION`, `BUILD_TIME`, `WINDOW_DEFAULTS`, `DESKTOP_DEFAULTS`, `BACKEND_DEFAULTS`, and `FRONTEND_DEFAULTS`. Other defines are forwarded to Bun and Vite.

The build tooling applies these values to the frontend and both Bun parts together without rewriting your editable config. `AppConfig.buildTime` is `null` in source development and gets one ISO timestamp per packaged build. Supply `BUILD_TIME` explicitly when you need a fixed timestamp. A tray tooltip or window title that still follows the app name follows an overridden name too; a custom value remains custom.

[Documentation home](README.md) · [Next: app shell](AppShell.md)

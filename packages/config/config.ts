// Application identity. Change these when starting a new app from the template.
const APP_ID = "astro-desktop";
const APP_NAME = "Astro Desktop";
const APP_VERSION = "0.0.1";
const APP_DESCRIPTION = "WebUI and Astro desktop application";

export const AppConfig = {
  id: APP_ID,
  appName: APP_NAME,
  appVersion: APP_VERSION,
  appDescription: APP_DESCRIPTION,
  buildTime: null, // Populated by the packaging script.
};

export const WindowConfig = {
  defaults: {
    title: APP_NAME,
    transparent: true,
    minimisable: true,
    maximisable: true,
    closeable: true,
    resizable: true,
  },
};

export const DesktopConfig = {
  defaults: {
    width: 1120,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    frameless: true,
    centered: true,
  },
};

export const BackendConfig = {
  defaults: {
    host: "127.0.0.1",
    port: 3000,
  },
};

export const FrontendConfig = {
  defaults: {
    host: "127.0.0.1",
    port: 4321,
  },
};

export const ToastConfig = {
  defaults: {
    sound: false,
    timeout: 10,
  },
  // Optional Windows AppUserModelID, once registered by your app's installer.
  windowsAppId: "",
};

export const ShellConfig = {
  defaults: {
    allowedSchemes: ["https:", "http:", "mailto:"],
  },
};

export const TrayConfig = {
  defaults: {
    enabled: true,
    tooltip: APP_NAME,
    menu: [
      { id: "show", label: "Show window" },
      { id: "hide", label: "Hide window" },
      { separator: true },
      { id: "quit", label: "Quit" },
    ],
  },
  icons: {
    win32: "", // System icon, or a repo-relative .ico file (e.g. ./assets/tray.ico).
    linux: "application-x-executable", // Theme name, or ./assets/tray.png.
  },
};

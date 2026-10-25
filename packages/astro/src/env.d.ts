/// <reference types="astro/client" />

interface Window {
  webui?: import("shared/desktop-events").DesktopBridge;
}

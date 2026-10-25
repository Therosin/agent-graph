import type { App } from "vue";
import { sendEvent } from "../desktop/events";
import { desktopEventsKey } from "./desktop";

/** Astro invokes this for each Vue island, on both the server and the client. */
export default function configureApp(app: App): void {
  app.config.globalProperties.$sendEvent = sendEvent;
  app.provide(desktopEventsKey, sendEvent);
}

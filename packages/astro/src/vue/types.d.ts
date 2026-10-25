import type { SendEvent } from "../desktop/events";

declare module "vue" {
  interface ComponentCustomProperties {
    $sendEvent: SendEvent;
  }
}

export {};

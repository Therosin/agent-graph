import { inject, type InjectionKey } from "vue";
import type { SendEvent } from "../desktop/events";

export const desktopEventsKey: InjectionKey<SendEvent> =
  Symbol("desktop-events");

/** Composition API / script setup access to the same method as this.$sendEvent. */
export function useDesktopEvents(): SendEvent {
  const sendEvent = inject(desktopEventsKey);
  if (!sendEvent)
    throw new Error(
      "Desktop events were not registered in the Vue app entrypoint",
    );
  return sendEvent;
}

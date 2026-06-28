/**
 * In-process event bus (doc 03: platform/events). A single small abstraction so features
 * communicate via events, not direct table access. Swap this implementation for a real
 * queue (SQS/Rabbit/Redis) when splitting services — publishers/subscribers don't change.
 *
 * Phase 1 uses it for `BookingCreated` (Phase 3 reminders will subscribe; a no-op
 * subscriber is registered now).
 */

import { logger } from "@server/platform/logging/logger";

export interface DomainEvents {
  BookingCreated: {
    organizationId: string;
    bookingId: string;
    staffId: string | null;
    serviceId: string | null;
    startDatetime: string;
  };
}

type EventName = keyof DomainEvents;
type Handler<E extends EventName> = (payload: DomainEvents[E]) => void | Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (payload: any) => void | Promise<void>;

class EventBus {
  private handlers: Map<EventName, AnyHandler[]> = new Map();

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as AnyHandler);
    this.handlers.set(event, list);
    return () => {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((h) => h !== handler),
      );
    };
  }

  async publish<E extends EventName>(
    event: E,
    payload: DomainEvents[E],
  ): Promise<void> {
    const hs = this.handlers.get(event) ?? [];
    for (const h of hs) {
      try {
        await h(payload);
      } catch (e) {
        logger.error("Event handler failed", {
          event,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  /** Test helper: clear all subscribers. */
  reset() {
    this.handlers = new Map();
  }
}

export const eventBus = new EventBus();

// Phase 3 reminders will subscribe here. No-op for now so the wiring exists.
eventBus.on("BookingCreated", () => {
  /* reminders subscribe in Phase 3 */
});

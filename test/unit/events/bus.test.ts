import { describe, it, expect, beforeEach } from "vitest";
import { eventBus } from "@server/platform/events/bus";

describe("event bus", () => {
  beforeEach(() => eventBus.reset());

  it("delivers a published event to subscribers", async () => {
    const seen: string[] = [];
    eventBus.on("BookingCreated", (p) => {
      seen.push(p.bookingId);
    });
    await eventBus.publish("BookingCreated", {
      organizationId: "o",
      bookingId: "b1",
      staffId: "s1",
      serviceId: "svc1",
      startDatetime: new Date().toISOString(),
    });
    expect(seen).toEqual(["b1"]);
  });

  it("unsubscribe stops delivery", async () => {
    const seen: string[] = [];
    const off = eventBus.on("BookingCreated", (p) => {
      seen.push(p.bookingId);
    });
    off();
    await eventBus.publish("BookingCreated", {
      organizationId: "o",
      bookingId: "b1",
      staffId: null,
      serviceId: null,
      startDatetime: new Date().toISOString(),
    });
    expect(seen).toEqual([]);
  });

  it("a throwing handler does not break other handlers", async () => {
    const seen: string[] = [];
    eventBus.on("BookingCreated", () => {
      throw new Error("boom");
    });
    eventBus.on("BookingCreated", (p) => {
      seen.push(p.bookingId);
    });
    await eventBus.publish("BookingCreated", {
      organizationId: "o",
      bookingId: "b2",
      staffId: null,
      serviceId: null,
      startDatetime: new Date().toISOString(),
    });
    expect(seen).toEqual(["b2"]);
  });
});

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createReadyOrg } from "./helpers/factories";
import {
  handleToolWebhook,
  handleCallEndedWebhook,
} from "@server/channels/voiceWebhook";
import { ToolName } from "@domain/enums";
import { DateTime } from "luxon";

function toolReq(orgId: string, toolName: string, args: unknown) {
  // The injected FakeVoiceProvider reads the neutral body; org rides in the body here.
  return new Request("http://localhost/api/webhook/voice/tools", {
    method: "POST",
    body: JSON.stringify({
      organizationId: orgId,
      toolCallId: "call_abc",
      toolName,
      args,
    }),
  });
}

describe.skipIf(!hasTestDb)("voice webhooks (I-VAPI-06..10)", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await disconnect();
  });

  it("I-VAPI-06: tool webhook runs the tool scoped to the org and echoes toolCallId", async () => {
    const { org, service } = await createReadyOrg(60);
    let d = DateTime.now().setZone(org.timezone).startOf("day");
    while (d.weekday !== 1) d = d.plus({ days: 1 });
    const date = d.plus({ weeks: 1 }).toISODate()!;

    const res = (await handleToolWebhook(
      toolReq(org.id, ToolName.CHECK_AVAILABILITY, { serviceId: service.id, date }),
    )) as { results: { toolCallId: string; result: string }[] };

    expect(res.results[0].toolCallId).toBe("call_abc");
    const parsed = JSON.parse(res.results[0].result);
    expect(parsed.available).toBe(true);
    expect(parsed.slots.length).toBeGreaterThan(0);
  });

  it("book_appointment via webhook creates a booking + customer", async () => {
    const { org, service } = await createReadyOrg(60);
    let d = DateTime.now().setZone(org.timezone).startOf("day");
    while (d.weekday !== 1) d = d.plus({ days: 1 });
    const start = d.plus({ weeks: 1 }).set({ hour: 11 });

    await handleToolWebhook(
      toolReq(org.id, ToolName.BOOK_APPOINTMENT, {
        serviceId: service.id,
        startDatetime: start.toISO(),
        customerName: "Jamie",
        customerPhone: "+14155550111",
      }),
    );
    const bookings = await prisma.booking.findMany({ where: { organizationId: org.id } });
    expect(bookings).toHaveLength(1);
    const customer = await prisma.customer.findFirst({ where: { organizationId: org.id } });
    expect(customer?.name).toBe("Jamie");
  });

  it("I-VAPI-08/09: call-ended saves a Call and is idempotent on the provider call id", async () => {
    const { org } = await createReadyOrg(60);
    const body = {
      organizationId: org.id,
      providerCallId: "vapi_call_xyz",
      endedReason: "customer-ended-call",
      cost: 0.12,
      messages: [
        { role: "assistant", text: "Hi" },
        { role: "user", text: "Bye" },
      ],
    };
    const make = () =>
      new Request("http://localhost/api/webhook/voice/call-ended", {
        method: "POST",
        body: JSON.stringify(body),
      });

    await handleCallEndedWebhook(make());
    await handleCallEndedWebhook(make()); // re-delivery

    const calls = await prisma.call.findMany({ where: { organizationId: org.id } });
    expect(calls).toHaveLength(1); // updated, not duplicated
    const msgs = await prisma.callMessage.findMany({ where: { callId: calls[0].id } });
    expect(msgs).toHaveLength(2);
  });
});

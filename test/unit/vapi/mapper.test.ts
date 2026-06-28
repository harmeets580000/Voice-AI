import { describe, it, expect } from "vitest";
import {
  parseInboundToolCall,
  formatToolResponse,
  parseCallEnded,
  mapAssistant,
  mapCallObject,
} from "@server/adapters/voice/vapi/vapi.mapper";
import { ToolName, CallDirection } from "@domain/enums";

describe("Vapi mapper — tool calls (U-VAPI-01, U-VAPI-02)", () => {
  it("U-VAPI-01: tool-call payload → NormalizedToolCall with org, name, args, toolCallId", () => {
    const req = {
      query: { organization_id: "orgA" },
      body: {
        message: {
          type: "tool-calls",
          toolCallList: [
            {
              id: "call_123",
              name: "check_availability",
              arguments: { serviceId: "svc1", date: "2026-06-15" },
            },
          ],
        },
      },
    };
    const out = parseInboundToolCall(req);
    expect(out.organizationId).toBe("orgA");
    expect(out.toolCallId).toBe("call_123");
    expect(out.toolName).toBe(ToolName.CHECK_AVAILABILITY);
    expect(out.args).toEqual({ serviceId: "svc1", date: "2026-06-15" });
  });

  it("supports the toolCalls[].function shape with stringified arguments", () => {
    const req = {
      query: { organization_id: "orgB" },
      body: {
        message: {
          toolCalls: [
            {
              id: "call_9",
              function: {
                name: "book_appointment",
                arguments: JSON.stringify({ staffId: "s1" }),
              },
            },
          ],
        },
      },
    };
    const out = parseInboundToolCall(req);
    expect(out.toolCallId).toBe("call_9");
    expect(out.toolName).toBe(ToolName.BOOK_APPOINTMENT);
    expect(out.args).toEqual({ staffId: "s1" });
  });

  it("reads org id from assistant metadata when no query param is present", () => {
    const out = parseInboundToolCall({
      body: {
        message: {
          assistant: { metadata: { organization_id: "orgMeta" } },
          toolCallList: [{ id: "c", name: "lookup_customer", arguments: {} }],
        },
      },
    });
    expect(out.organizationId).toBe("orgMeta");
  });

  it("U-VAPI-02: formatToolResponse echoes the same toolCallId", () => {
    const res = formatToolResponse("call_123", { ok: true }) as {
      results: { toolCallId: string; result: string }[];
    };
    expect(res.results[0].toolCallId).toBe("call_123");
    expect(res.results[0].result).toBe(JSON.stringify({ ok: true }));
  });

  it("formatToolResponse passes strings through unchanged", () => {
    const res = formatToolResponse("c", "Booked!") as {
      results: { result: string }[];
    };
    expect(res.results[0].result).toBe("Booked!");
  });
});

describe("Vapi mapper — call ended (U-VAPI-03)", () => {
  it("U-VAPI-03: end-of-call report → NormalizedCallRecord with ids, cost, endedReason, turns", () => {
    const req = {
      query: { organization_id: "orgA" },
      body: {
        message: {
          type: "end-of-call-report",
          endedReason: "customer-ended-call",
          cost: 0.1234,
          costBreakdown: { llm: 0.05, tts: 0.07 },
          recordingUrl: "https://rec.example/abc.mp3",
          summary: "Booked a cleaning.",
          startedAt: "2026-06-15T17:00:00.000Z",
          endedAt: "2026-06-15T17:03:00.000Z",
          call: {
            id: "vapi_call_1",
            orgId: "vapi_org_1",
            phoneCallProvider: "twilio",
            phoneCallProviderId: "CA123",
          },
          assistant: { id: "asst_1" },
          phoneNumber: { id: "pn_1", number: "+15555550123" },
          customer: { number: "+14155550111" },
          messages: [
            { role: "system", message: "You are a receptionist" },
            { role: "assistant", message: "Hello!", secondsFromStart: 0 },
            { role: "user", message: "I'd like a cleaning", secondsFromStart: 3 },
          ],
        },
      },
    };
    const out = parseCallEnded(req);
    expect(out.organizationId).toBe("orgA");
    expect(out.direction).toBe(CallDirection.INBOUND);
    expect(out.providerCallId).toBe("vapi_call_1");
    expect(out.providerOrgId).toBe("vapi_org_1");
    expect(out.assistantId).toBe("asst_1");
    expect(out.phoneNumberId).toBe("pn_1");
    expect(out.phoneCallProvider).toBe("twilio");
    expect(out.endedReason).toBe("customer-ended-call");
    expect(out.cost).toBeCloseTo(0.1234);
    expect(out.recordingUrl).toBe("https://rec.example/abc.mp3");
    expect(out.summary).toBe("Booked a cleaning.");
    expect(out.durationSeconds).toBe(180);
    expect(out.fromNumber).toBe("+14155550111");
    expect(out.toNumber).toBe("+15555550123");
    // system turn dropped; two turns kept in order.
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0]).toMatchObject({ role: "assistant", text: "Hello!" });
  });

  it("derives summary from analysis.summary and messages from artifact when needed", () => {
    const out = parseCallEnded({
      query: { organization_id: "o" },
      body: {
        message: {
          call: { id: "c1" },
          analysis: { summary: "From analysis" },
          artifact: {
            recordingUrl: "https://r/x.mp3",
            messages: [{ role: "assistant", message: "Hi" }],
          },
        },
      },
    });
    expect(out.summary).toBe("From analysis");
    expect(out.recordingUrl).toBe("https://r/x.mp3");
    expect(out.messages).toHaveLength(1);
  });
});

describe("Vapi mapper — pull-sync (mapAssistant, mapCallObject)", () => {
  it("mapAssistant extracts greeting/prompt/voice/model + ids", () => {
    const a = mapAssistant({
      id: "asst_1",
      name: "Front desk",
      firstMessage: "Hello!",
      phoneNumberId: "pn_1",
      model: {
        provider: "openai",
        model: "gpt-4o",
        knowledgeBaseId: "kb_1",
        messages: [{ role: "system", content: "You are a receptionist." }],
      },
      voice: { provider: "vapi", voiceId: "Elliot" },
    });
    expect(a.assistantId).toBe("asst_1");
    expect(a.greeting).toBe("Hello!");
    expect(a.prompt).toBe("You are a receptionist.");
    expect(a.voice).toBe("Elliot");
    expect(a.llmModel).toBe("gpt-4o");
    expect(a.phoneNumberId).toBe("pn_1");
    expect(a.knowledgeBaseId).toBe("kb_1");
  });

  it("mapCallObject maps a calls.list object → NormalizedCallRecord", () => {
    const c = mapCallObject(
      {
        id: "call_99",
        orgId: "vapi_org",
        assistantId: "asst_1",
        phoneNumberId: "pn_1",
        endedReason: "customer-ended-call",
        cost: 0.2,
        recordingUrl: "https://rec/abc.mp3",
        summary: "Booked a haircut",
        startedAt: "2026-06-15T10:00:00.000Z",
        endedAt: "2026-06-15T10:02:00.000Z",
        customer: { number: "+14155550123" },
        messages: [
          { role: "system", message: "sys" },
          { role: "assistant", message: "Hi" },
        ],
      },
      "orgA",
    );
    expect(c.organizationId).toBe("orgA");
    expect(c.direction).toBe(CallDirection.INBOUND);
    expect(c.providerCallId).toBe("call_99");
    expect(c.assistantId).toBe("asst_1");
    expect(c.endedReason).toBe("customer-ended-call");
    expect(c.cost).toBeCloseTo(0.2);
    expect(c.recordingUrl).toBe("https://rec/abc.mp3");
    expect(c.summary).toBe("Booked a haircut");
    expect(c.durationSeconds).toBe(120);
    expect(c.fromNumber).toBe("+14155550123");
    expect(c.messages).toHaveLength(1); // system turn dropped
  });
});

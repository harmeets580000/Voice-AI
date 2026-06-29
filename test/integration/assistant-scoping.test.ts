import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { DateTime } from "luxon";
import { hasTestDb, truncateAll, disconnect } from "./helpers/db";
import {
  createReadyOrg,
  createStaff,
  createService,
  createWeekdaySchedule,
} from "./helpers/factories";
import { setVoiceProvider } from "@server/config/providers";
import { FakeVoiceProvider } from "@server/adapters/voice/fake/fake.provider";
import {
  createAssistant,
  setAssistantServices,
  setAssistantStaff,
  getAssistantScope,
  getAssistant,
} from "@server/features/assistants/assistants.service";
import { runTool } from "@server/features/receptionist-tools/tools.registry";
import { getAvailability } from "@server/features/bookings/booking.engine";
import { ToolName } from "@domain/enums";

/** A future weekday (the seeded schedule is Mon–Fri) in the org timezone. */
function futureWeekday(tz = "America/Los_Angeles"): string {
  let d = DateTime.now().setZone(tz).plus({ days: 7 }).startOf("day");
  while (d.weekday > 5) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

describe.skipIf(!hasTestDb)("per-assistant service/staff scoping", () => {
  beforeEach(async () => {
    await truncateAll();
    setVoiceProvider(new FakeVoiceProvider());
  });
  afterAll(async () => {
    await disconnect();
  });

  async function setup() {
    const { org, staff: staff1, service: service1 } = await createReadyOrg();
    const staff2 = await createStaff(org.id, "Bob");
    await createWeekdaySchedule(org.id, staff2.id);
    const service2 = await createService(org.id, 30);
    return { org, staff1, staff2, service1, service2 };
  }

  it("setAssistantServices/setAssistantStaff persist, appear in the DTO, and reject foreign ids", async () => {
    const { org, staff1, service1 } = await setup();
    const a = await createAssistant(org.id, { name: "A" });

    await setAssistantServices(org.id, a.id, [service1.id]);
    await setAssistantStaff(org.id, a.id, [staff1.id]);

    const dto = await getAssistant(org.id, a.id);
    expect(dto.selectedServiceIds).toEqual([service1.id]);
    expect(dto.selectedStaffIds).toEqual([staff1.id]);

    await expect(setAssistantServices(org.id, a.id, ["svc_not_in_org"])).rejects.toThrow(
      /Unknown service/,
    );
    await expect(setAssistantStaff(org.id, a.id, ["staff_not_in_org"])).rejects.toThrow(
      /Unknown staff/,
    );
  });

  it("a scoped assistant only lists its selected services & staff; no selection = all", async () => {
    const { org, staff1, service1, service2 } = await setup();
    const scoped = await createAssistant(org.id, { name: "Scoped" });
    const open = await createAssistant(org.id, { name: "Open" });
    await setAssistantServices(org.id, scoped.id, [service1.id]);
    await setAssistantStaff(org.id, scoped.id, [staff1.id]);

    const scopedScope = await getAssistantScope(org.id, scoped.id);
    const openScope = await getAssistantScope(org.id, open.id);

    const scopedServices = (await runTool(org.id, scopedScope, ToolName.LIST_SERVICES, {})) as {
      services: { id: string }[];
    };
    expect(scopedServices.services.map((s) => s.id)).toEqual([service1.id]);

    const openServices = (await runTool(org.id, openScope, ToolName.LIST_SERVICES, {})) as {
      services: { id: string }[];
    };
    expect(openServices.services.map((s) => s.id).sort()).toEqual(
      [service1.id, service2.id].sort(),
    );

    const scopedStaff = (await runTool(org.id, scopedScope, ToolName.LIST_STAFF, {})) as {
      staff: { id: string }[];
    };
    expect(scopedStaff.staff.map((s) => s.id)).toEqual([staff1.id]);

    const openStaff = (await runTool(org.id, openScope, ToolName.LIST_STAFF, {})) as {
      count: number;
    };
    expect(openStaff.count).toBe(2);
  });

  it("check_availability refuses a service the assistant does not offer", async () => {
    const { org, service1, service2 } = await setup();
    const scoped = await createAssistant(org.id, { name: "Scoped" });
    await setAssistantServices(org.id, scoped.id, [service1.id]);
    const scope = await getAssistantScope(org.id, scoped.id);

    const res = (await runTool(org.id, scope, ToolName.CHECK_AVAILABILITY, {
      serviceId: service2.id,
      date: futureWeekday(),
    })) as { available: boolean };
    expect(res.available).toBe(false);
  });

  it("getAvailability honors allowedStaffIds", async () => {
    const { org, staff1, service1 } = await setup();
    const date = futureWeekday();

    const all = await getAvailability(org.id, service1.id, date);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((s) => s.availableStaffIds.length >= 2)).toBe(true);

    const onlyStaff1 = await getAvailability(org.id, service1.id, date, [staff1.id]);
    expect(onlyStaff1.length).toBeGreaterThan(0);
    expect(
      onlyStaff1.every((s) => s.availableStaffIds.every((id) => id === staff1.id)),
    ).toBe(true);
  });
});

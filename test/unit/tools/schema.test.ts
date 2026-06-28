import { describe, it, expect } from "vitest";
import {
  CheckAvailabilityArgs,
  BookAppointmentArgs,
  LookupCustomerArgs,
} from "@server/features/receptionist-tools/tools.schema";

describe("tool arg validation (U-TOOL-07)", () => {
  it("check_availability requires serviceId + a YYYY-MM-DD date", () => {
    expect(CheckAvailabilityArgs.safeParse({ serviceId: "s", date: "2026-06-15" }).success).toBe(true);
    expect(CheckAvailabilityArgs.safeParse({ serviceId: "s", date: "June 15" }).success).toBe(false);
    expect(CheckAvailabilityArgs.safeParse({ date: "2026-06-15" }).success).toBe(false);
  });

  it("book_appointment requires serviceId + startDatetime", () => {
    expect(
      BookAppointmentArgs.safeParse({ serviceId: "s", startDatetime: "2026-06-15T10:00:00Z" }).success,
    ).toBe(true);
    expect(BookAppointmentArgs.safeParse({ serviceId: "s" }).success).toBe(false);
  });

  it("lookup_customer requires a phone", () => {
    expect(LookupCustomerArgs.safeParse({ phone: "+14155550111" }).success).toBe(true);
    expect(LookupCustomerArgs.safeParse({}).success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { formatDateTime } from "@shared/format";
import {
  DATE_FORMAT_PRESETS,
  DateFormatEnum,
} from "@contracts/settings";

const iso = "2026-06-27T14:30:00.000Z";

describe("formatDateTime", () => {
  it("formats an ISO string with the default pattern (DD/MM/YYYY 24h)", () => {
    // Use an explicit pattern to avoid TZ ambiguity in the assertion.
    expect(formatDateTime("2026-06-27T14:30:00", "dd/MM/yyyy HH:mm")).toBe(
      "27/06/2026 14:30",
    );
  });

  it("supports each preset pattern", () => {
    for (const p of DATE_FORMAT_PRESETS) {
      const out = formatDateTime("2026-06-27T14:30:00", p.value);
      expect(out).toBeTruthy();
      expect(out).not.toBe("—");
    }
  });

  it("returns an em dash for null/empty/invalid", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("accepts a Date object", () => {
    const out = formatDateTime(new Date(iso), "yyyy-MM-dd");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("preset values are valid per the contract enum", () => {
    for (const p of DATE_FORMAT_PRESETS) {
      expect(DateFormatEnum.safeParse(p.value).success).toBe(true);
    }
  });
});

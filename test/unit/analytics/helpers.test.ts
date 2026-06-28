import { describe, it, expect } from "vitest";
import {
  periodToRange,
  deltaPct,
  bucketByDay,
} from "@server/features/analytics/analytics.service";

const DAY = 86_400_000;

describe("periodToRange", () => {
  it("computes current + previous windows for each period", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    for (const [period, days] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ] as const) {
      const r = periodToRange(period, now);
      expect(r.days).toBe(days);
      expect(r.to).toEqual(now);
      expect(r.to.getTime() - r.from.getTime()).toBe(days * DAY);
      expect(r.prevTo).toEqual(r.from);
      expect(r.prevTo.getTime() - r.prevFrom.getTime()).toBe(days * DAY);
    }
  });
});

describe("deltaPct", () => {
  it("returns rounded % change", () => {
    expect(deltaPct(110, 100)).toBe(10);
    expect(deltaPct(50, 100)).toBe(-50);
  });
  it("returns null when there is no baseline (avoids divide-by-zero)", () => {
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });
});

describe("bucketByDay", () => {
  it("fills every day in range and sums values per day (tz-aware)", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-03T12:00:00Z");
    const items = [
      { d: "2026-01-01T05:00:00Z" },
      { d: "2026-01-01T20:00:00Z" },
      { d: "2026-01-02T10:00:00Z" },
    ];
    const out = bucketByDay(
      items,
      (i) => new Date(i.d),
      () => 1,
      "UTC",
      from,
      to,
    );
    expect(out).toEqual([
      { date: "2026-01-01", value: 2 },
      { date: "2026-01-02", value: 1 },
      { date: "2026-01-03", value: 0 },
    ]);
  });
});

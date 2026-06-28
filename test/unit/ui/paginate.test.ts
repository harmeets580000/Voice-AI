import { describe, it, expect } from "vitest";
import { paginate } from "@shared/ui/DataTable";

const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i) }));

describe("DataTable paginate()", () => {
  it("returns the right page slice and page count", () => {
    const r = paginate(rows, 1, 10);
    expect(r.items).toHaveLength(10);
    expect(r.pageCount).toBe(3);
    expect(r.items[0].id).toBe("0");
  });

  it("last page has the remainder", () => {
    const r = paginate(rows, 3, 10);
    expect(r.items).toHaveLength(5);
    expect(r.page).toBe(3);
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(rows, 99, 10).page).toBe(3);
    expect(paginate(rows, 0, 10).page).toBe(1);
  });

  it("handles empty input", () => {
    const r = paginate([], 1, 10);
    expect(r.items).toHaveLength(0);
    expect(r.pageCount).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { slugify } from "@shared/format";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Bright Smile Dental")).toBe("bright-smile-dental");
  });
  it("strips punctuation and collapses separators", () => {
    expect(slugify("  Joe's  Barber & Co. ")).toBe("joe-s-barber-co");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("--Hello--")).toBe("hello");
  });
  it("handles empty / symbol-only input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("@#$")).toBe("");
  });
});

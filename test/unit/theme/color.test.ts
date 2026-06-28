import { describe, it, expect } from "vitest";
import {
  isValidColor,
  contrastRatio,
  isLowContrast,
  toRgb,
} from "@theme/color";

describe("color validation (U-THEME-04)", () => {
  it("accepts hex (3/6/8 digits) and rgb/rgba", () => {
    expect(isValidColor("#fff")).toBe(true);
    expect(isValidColor("#6366F1")).toBe(true);
    expect(isValidColor("#6366F1AA")).toBe(true);
    expect(isValidColor("rgb(10,20,30)")).toBe(true);
    expect(isValidColor("rgba(30,41,59,0.06)")).toBe(true);
  });

  it("U-THEME-04: rejects invalid colors", () => {
    expect(isValidColor("not-a-color")).toBe(false);
    expect(isValidColor("#12345")).toBe(false);
    expect(isValidColor("rgb(300)")).toBe(false);
    expect(isValidColor("")).toBe(false);
  });
});

describe("contrast (supports C-THEME-09)", () => {
  it("parses hex to rgb", () => {
    expect(toRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(toRgb("#000")).toEqual([0, 0, 0]);
  });

  it("black on white is maximal contrast (~21)", () => {
    expect(Math.round(contrastRatio("#000000", "#ffffff"))).toBe(21);
  });

  it("flags low-contrast pairs", () => {
    expect(isLowContrast("#ffffff", "#fefefe")).toBe(true);
    expect(isLowContrast("#000000", "#ffffff")).toBe(false);
  });
});

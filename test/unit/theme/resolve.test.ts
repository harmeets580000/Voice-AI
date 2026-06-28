import { describe, it, expect } from "vitest";
import { resolveTheme, resolveTokensForMode } from "@theme/resolve";
import { defaultTheme } from "@theme/tokens";

describe("theme resolver (U-THEME-01..03)", () => {
  it("U-THEME-01: platform default only → returns platform values", () => {
    const t = resolveTheme(defaultTheme, null);
    expect(t.light.accent).toBe(defaultTheme.light.accent);
    expect(t.dark.bg).toBe(defaultTheme.dark.bg);
  });

  it("U-THEME-02: org override wins; unset tokens fall back to default", () => {
    const t = resolveTheme(defaultTheme, {
      light: { accent: "#000000" },
    });
    expect(t.light.accent).toBe("#000000"); // overridden
    expect(t.light.bg).toBe(defaultTheme.light.bg); // inherited
    expect(t.dark.accent).toBe(defaultTheme.dark.accent); // untouched mode
  });

  it("U-THEME-02b: empty-string override is ignored (treated as unset)", () => {
    const t = resolveTheme(defaultTheme, { light: { accent: "" } });
    expect(t.light.accent).toBe(defaultTheme.light.accent);
  });

  it("U-THEME-03: user light/dark toggle selects the correct mode's tokens", () => {
    const light = resolveTokensForMode(defaultTheme, null, "light");
    const dark = resolveTokensForMode(defaultTheme, null, "dark");
    expect(light.bg).toBe(defaultTheme.light.bg);
    expect(dark.bg).toBe(defaultTheme.dark.bg);
    expect(light.bg).not.toBe(dark.bg);
  });

  it("override defaultMode + allowUserToggle take effect", () => {
    const t = resolveTheme(defaultTheme, {
      defaultMode: "dark",
      allowUserToggle: false,
    });
    expect(t.defaultMode).toBe("dark");
    expect(t.allowUserToggle).toBe(false);
  });
});

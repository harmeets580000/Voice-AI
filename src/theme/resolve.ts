/**
 * Pure theme resolution: platform default → org override → user mode toggle.
 * No I/O, so it's directly unit-testable (tests U-THEME-01..03).
 */

import {
  defaultTheme,
  TOKEN_NAMES,
  type Theme,
  type ThemeMode,
  type ThemeOverride,
  type ThemeTokens,
} from "./tokens";

function mergeTokens(
  base: ThemeTokens,
  override?: Partial<ThemeTokens>,
): ThemeTokens {
  if (!override) return { ...base };
  const out = { ...base };
  for (const name of TOKEN_NAMES) {
    const v = override[name];
    if (typeof v === "string" && v.length > 0) out[name] = v;
  }
  return out;
}

/**
 * Resolve the effective full theme for an org by layering its override on the platform
 * theme (which itself falls back to the built-in default).
 */
export function resolveTheme(
  platform: Theme | null | undefined,
  override: ThemeOverride | null | undefined,
): Theme {
  const platformTheme = platform ?? defaultTheme;
  return {
    light: mergeTokens(platformTheme.light, override?.light),
    dark: mergeTokens(platformTheme.dark, override?.dark),
    defaultMode: override?.defaultMode ?? platformTheme.defaultMode,
    allowUserToggle:
      override?.allowUserToggle ?? platformTheme.allowUserToggle,
  };
}

/** Tokens for a specific mode after resolution (what ThemeProvider writes to :root). */
export function resolveTokensForMode(
  platform: Theme | null | undefined,
  override: ThemeOverride | null | undefined,
  mode: ThemeMode,
): ThemeTokens {
  const theme = resolveTheme(platform, override);
  return mode === "dark" ? theme.dark : theme.light;
}

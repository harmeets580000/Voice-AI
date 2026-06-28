/**
 * Theme token model + defaults (doc 03 §1.3.1). Components consume these via CSS
 * variables (var(--accent), etc.) — never hardcoded hex. The theme config page edits
 * these tokens; ThemeProvider writes them onto :root.
 */

/** The ordered list of theme tokens and their CSS-variable names. */
export const TOKEN_CSS_VARS: Record<string, string> = {
  accent: "--accent",
  accentSoft: "--accent-soft",
  onAccent: "--on-accent",
  positive: "--positive",
  bg: "--bg",
  card: "--card",
  text: "--text",
  ink2: "--ink2",
  muted: "--muted",
  muted2: "--muted2",
  muted3: "--muted3",
  faint: "--faint",
  faint2: "--faint2",
  faint3: "--faint3",
  border: "--border",
};

export const TOKEN_NAMES = Object.keys(TOKEN_CSS_VARS) as TokenName[];

export type TokenName = keyof typeof TOKEN_CSS_VARS;

export type ThemeTokens = Record<TokenName, string>;

export type ThemeMode = "light" | "dark";

/** A full theme: tokens for each mode + behaviour flags. */
export interface Theme {
  light: ThemeTokens;
  dark: ThemeTokens;
  defaultMode: ThemeMode;
  allowUserToggle: boolean;
}

/** Partial overrides an org can store on top of the platform default. */
export interface ThemeOverride {
  light?: Partial<ThemeTokens>;
  dark?: Partial<ThemeTokens>;
  defaultMode?: ThemeMode;
  allowUserToggle?: boolean;
}

/** Default tokens — refined for a clean, professional look (kept in sync with globals.css). */
export const defaultTheme: Theme = {
  defaultMode: "light",
  allowUserToggle: true,
  light: {
    accent: "#6366F1",
    accentSoft: "#4F46E5",
    onAccent: "#FFFFFF",
    positive: "#16A34A",
    bg: "#F6F7FB",
    card: "#FFFFFF",
    text: "#0F1422",
    ink2: "#3F4660",
    muted: "#5A6178",
    muted2: "#6B7287",
    muted3: "#7C8396",
    faint: "#8A91A3",
    faint2: "#9AA0B2",
    faint3: "#AEB4C2",
    border: "rgba(15,23,42,0.10)",
  },
  dark: {
    accent: "#818CF8",
    accentSoft: "#A5B4FC",
    onAccent: "#0B0D14",
    positive: "#34D399",
    bg: "#0A0C12",
    card: "#14161F",
    text: "#EEF1F8",
    ink2: "#CDD3E0",
    muted: "#9AA0B2",
    muted2: "#B6BCCB",
    muted3: "#898F9F",
    faint: "#797F90",
    faint2: "#6E7385",
    faint3: "#5B6072",
    border: "rgba(255,255,255,0.10)",
  },
};

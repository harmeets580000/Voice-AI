import { z } from "zod";
import { isValidColor } from "@theme/color";

const Color = z.string().refine(isValidColor, {
  message: "Must be a hex (#RGB/#RRGGBB) or rgb(a) color",
});

const ModeEnum = z.enum(["light", "dark"]);

export const ThemeTokensSchema = z.object({
  accent: Color,
  accentSoft: Color,
  onAccent: Color,
  positive: Color,
  bg: Color,
  card: Color,
  text: Color,
  ink2: Color,
  muted: Color,
  muted2: Color,
  muted3: Color,
  faint: Color,
  faint2: Color,
  faint3: Color,
  border: Color,
});
export type ThemeTokensDTO = z.infer<typeof ThemeTokensSchema>;

export const ThemeSchema = z.object({
  light: ThemeTokensSchema,
  dark: ThemeTokensSchema,
  defaultMode: ModeEnum,
  allowUserToggle: z.boolean(),
});
export type ThemeDTO = z.infer<typeof ThemeSchema>;

/** Partial overrides an org (or the platform editor) submits. */
export const ThemeOverrideSchema = z.object({
  light: ThemeTokensSchema.partial().optional(),
  dark: ThemeTokensSchema.partial().optional(),
  defaultMode: ModeEnum.optional(),
  allowUserToggle: z.boolean().optional(),
});
export type ThemeOverrideDTO = z.infer<typeof ThemeOverrideSchema>;

export const GetThemeResponse = z.object({
  /** Fully resolved theme (platform default + active-org override). */
  theme: ThemeSchema,
  /** The raw org override (so the editor can show "overridden vs inherited"). */
  override: ThemeOverrideSchema.nullable(),
});
export type GetThemeResponse = z.infer<typeof GetThemeResponse>;

export const PutThemeRequest = ThemeOverrideSchema;
export type PutThemeRequest = z.infer<typeof PutThemeRequest>;

export const PutThemeResponse = z.object({ theme: ThemeSchema });
export type PutThemeResponse = z.infer<typeof PutThemeResponse>;

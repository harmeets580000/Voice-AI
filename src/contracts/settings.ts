import { z } from "zod";

/**
 * Org-level preferences. `dateFormat` is a luxon pattern chosen from a small allowlist of
 * presets (so it can't be an arbitrary/invalid pattern). Applied app-wide via the client
 * formatter (src/features/settings/SettingsProvider).
 */

export const DATE_FORMAT_PRESETS = [
  { value: "dd/MM/yyyy HH:mm", label: "DD/MM/YYYY 24h", sample: "27/06/2026 14:30" },
  { value: "dd MMM yyyy, h:mm a", label: "DD Mon YYYY 12h", sample: "27 Jun 2026, 2:30 PM" },
  { value: "MM/dd/yyyy h:mm a", label: "MM/DD/YYYY 12h", sample: "06/27/2026 2:30 PM" },
  { value: "yyyy-MM-dd HH:mm", label: "ISO (YYYY-MM-DD)", sample: "2026-06-27 14:30" },
] as const;

export const DEFAULT_DATE_FORMAT = DATE_FORMAT_PRESETS[0].value;

export const DateFormatEnum = z.enum([
  "dd/MM/yyyy HH:mm",
  "dd MMM yyyy, h:mm a",
  "MM/dd/yyyy h:mm a",
  "yyyy-MM-dd HH:mm",
]);
export type DateFormat = z.infer<typeof DateFormatEnum>;

export const SettingsResponse = z.object({
  dateFormat: DateFormatEnum,
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;

export const UpdateSettingsRequest = z.object({
  dateFormat: DateFormatEnum,
});
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequest>;

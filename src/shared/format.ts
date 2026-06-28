import { DateTime } from "luxon";
import { DEFAULT_DATE_FORMAT } from "@contracts/settings";

/**
 * Format a date/ISO string with a luxon pattern. Pure + framework-agnostic so it's unit
 * testable; the SettingsProvider supplies the active org's configured pattern.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  pattern: string = DEFAULT_DATE_FORMAT,
): string {
  if (!value) return "—";
  const dt =
    typeof value === "string"
      ? DateTime.fromISO(value)
      : DateTime.fromJSDate(value);
  if (!dt.isValid) return "—";
  return dt.toFormat(pattern);
}

/** Convert a display name into a URL-safe slug (lowercase, hyphens). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FALLBACK_TZS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** Full IANA timezone list (via Intl), falling back to a curated set. */
export function timezoneList(): string[] {
  try {
    const intl = Intl as unknown as {
      supportedValuesOf?: (k: string) => string[];
    };
    const all = intl.supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch {
    /* fall through */
  }
  return FALLBACK_TZS;
}

/** The browser's current timezone (or UTC on the server). */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

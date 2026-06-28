/** Small client-side formatters for dashboard values. */

export const nfmt = (n: number) => new Intl.NumberFormat().format(n);

export const cfmt = (n: number) =>
  "$" + new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

export const dur = (s: number | null | undefined) =>
  s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

export const dayLabel = (d: string) => {
  const t = new Date(d);
  return isNaN(t.getTime())
    ? d
    : t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const SOURCE_LABELS: Record<string, string> = {
  phone: "Phone (AI)",
  web: "Web",
  whatsapp: "WhatsApp",
  admin: "Manual",
};

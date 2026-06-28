/**
 * Colour helpers: validation (hex / rgb / rgba) and a WCAG contrast ratio used for the
 * non-blocking contrast warning on the theme config page.
 */

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB =
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;

export function isValidColor(value: string): boolean {
  return HEX.test(value) || RGB.test(value);
}

/** Parse a hex or rgb(a) string into [r,g,b] (0-255). Returns null if unparseable. */
export function toRgb(value: string): [number, number, number] | null {
  if (HEX.test(value)) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }
  const m = value.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/,
  );
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** WCAG contrast ratio (1..21). Returns 1 if either colour can't be parsed. */
export function contrastRatio(a: string, b: string): number {
  const ca = toRgb(a);
  const cb = toRgb(b);
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** True if the pair is hard to read (below WCAG AA for normal text, 4.5:1). */
export function isLowContrast(a: string, b: string): boolean {
  return contrastRatio(a, b) < 4.5;
}

// Colour helpers matching the worker's palette maths (services/worker/app/engines/colors.py), so
// choosing another primary colour in the form derives the same dark and tint shades.

type HSL = { h: number; s: number; l: number };

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHsl([r, g, b]: [number, number, number]): HSL {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function toHex({ h, s, l }: HSL): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** A deeper shade of the brand colour (worker: lightness × 0.6, at least 0.12). */
export function deriveDark(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { h, s, l } = toHsl(rgb);
  return toHex({ h, s, l: Math.max(0.12, l * 0.6) });
}

/** A pale wash of the brand colour (worker: lightness 0.95, saturation at most 0.45). */
export function deriveTint(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { h, s } = toHsl(rgb);
  return toHex({ h, s: Math.min(s, 0.45), l: 0.95 });
}

/** Black or white text, whichever reads better on the colour (WCAG relative luminance). */
export function readableOn(hex: string | null | undefined): "light" | "dark" {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return "dark";
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "dark" : "light";
}

/** What a native colour input shows while the field is empty (it cannot be blank). */
export const EMPTY_SWATCH = "#ffffff";

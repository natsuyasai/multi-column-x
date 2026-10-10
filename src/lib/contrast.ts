export function parseHexColor(hex: string): {
  r: number;
  g: number;
  b: number;
} {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    throw new Error(`不正な色指定です: ${hex}`);
  }
  const digits = hex.slice(1);
  const full =
    digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function linearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  return (
    0.2126 * linearize(r / 255) +
    0.7152 * linearize(g / 255) +
    0.0722 * linearize(b / 255)
  );
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parse(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

/** latest が current より新しいバージョンか（数値ドット比較）。 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

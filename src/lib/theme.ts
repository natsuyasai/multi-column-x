export type ResolvedTheme = "dark" | "light";

/**
 * テーマ設定値とOSのダーク指向から、適用すべき実テーマを決定する純粋関数。
 * 不正値はdarkにフォールバックする。
 */
export function resolveTheme(
  theme: string,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (theme === "light") return "light";
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return "dark";
}

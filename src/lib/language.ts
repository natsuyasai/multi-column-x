export const LANGUAGE_SETTINGS = ["auto", "ja", "en"] as const;

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];
export type ResolvedLanguage = "ja" | "en";

/** 保存値などの不明な値を言語設定へ正規化する。未対応の値は "auto" として扱う */
export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  return LANGUAGE_SETTINGS.find((s) => s === value) ?? "auto";
}

/** 言語設定とOSの言語から実際に使う表示言語を決める。OS言語が ja* 以外・取得不能なら英語 */
export function resolveLanguage(
  setting: LanguageSetting,
  osLocale: string | null | undefined,
): ResolvedLanguage {
  if (setting !== "auto") return setting;
  return osLocale?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

/** OSの言語（WebView が追従する navigator.language）を取得する。取得できなければ null */
export function getOsLocale(): string | null {
  return typeof navigator !== "undefined" ? navigator.language : null;
}

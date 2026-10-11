import { useEffect } from "react";
import i18n from "@/i18n";
import {
  getOsLocale,
  normalizeLanguageSetting,
  resolveLanguage,
  type ResolvedLanguage,
} from "@/lib/language";

/**
 * globalSettings.language を解決済みの表示言語に変換し、
 * i18next と document.documentElement の lang 属性へ反映する。
 * 戻り値は解決済み言語（"ja" | "en"）。再描画は react-i18next が行う。
 */
export function useAppLanguage(setting: string | undefined): ResolvedLanguage {
  const resolved = resolveLanguage(
    normalizeLanguageSetting(setting),
    getOsLocale(),
  );

  useEffect(() => {
    void i18n.changeLanguage(resolved);
    document.documentElement.lang = resolved;
  }, [resolved]);

  return resolved;
}

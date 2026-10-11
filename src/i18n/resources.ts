import enCommon from "@/locales/en/common.json";
import enSettings from "@/locales/en/settings.json";
import jaCommon from "@/locales/ja/common.json";
import jaSettings from "@/locales/ja/settings.json";

export const resources = {
  ja: { common: jaCommon, settings: jaSettings },
  en: { common: enCommon, settings: enSettings },
} as const;

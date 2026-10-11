import enColumns from "@/locales/en/columns.json";
import enColumnSettings from "@/locales/en/columnSettings.json";
import enCommon from "@/locales/en/common.json";
import enMessages from "@/locales/en/messages.json";
import enRateLimit from "@/locales/en/rateLimit.json";
import enSettings from "@/locales/en/settings.json";
import jaColumns from "@/locales/ja/columns.json";
import jaColumnSettings from "@/locales/ja/columnSettings.json";
import jaCommon from "@/locales/ja/common.json";
import jaMessages from "@/locales/ja/messages.json";
import jaRateLimit from "@/locales/ja/rateLimit.json";
import jaSettings from "@/locales/ja/settings.json";

export const resources = {
  ja: {
    common: jaCommon,
    settings: jaSettings,
    columnSettings: jaColumnSettings,
    columns: jaColumns,
    messages: jaMessages,
    rateLimit: jaRateLimit,
  },
  en: {
    common: enCommon,
    settings: enSettings,
    columnSettings: enColumnSettings,
    columns: enColumns,
    messages: enMessages,
    rateLimit: enRateLimit,
  },
} as const;

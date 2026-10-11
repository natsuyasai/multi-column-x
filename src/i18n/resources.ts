import enAccounts from "@/locales/en/accounts.json";
import enColumns from "@/locales/en/columns.json";
import enColumnSettings from "@/locales/en/columnSettings.json";
import enCommon from "@/locales/en/common.json";
import enDialogs from "@/locales/en/dialogs.json";
import enMessages from "@/locales/en/messages.json";
import enMobile from "@/locales/en/mobile.json";
import enRateLimit from "@/locales/en/rateLimit.json";
import enSettings from "@/locales/en/settings.json";
import enTopbar from "@/locales/en/topbar.json";
import jaAccounts from "@/locales/ja/accounts.json";
import jaColumns from "@/locales/ja/columns.json";
import jaColumnSettings from "@/locales/ja/columnSettings.json";
import jaCommon from "@/locales/ja/common.json";
import jaDialogs from "@/locales/ja/dialogs.json";
import jaMessages from "@/locales/ja/messages.json";
import jaMobile from "@/locales/ja/mobile.json";
import jaRateLimit from "@/locales/ja/rateLimit.json";
import jaSettings from "@/locales/ja/settings.json";
import jaTopbar from "@/locales/ja/topbar.json";

export const resources = {
  ja: {
    common: jaCommon,
    accounts: jaAccounts,
    settings: jaSettings,
    columnSettings: jaColumnSettings,
    columns: jaColumns,
    dialogs: jaDialogs,
    messages: jaMessages,
    mobile: jaMobile,
    topbar: jaTopbar,
    rateLimit: jaRateLimit,
  },
  en: {
    common: enCommon,
    accounts: enAccounts,
    settings: enSettings,
    columnSettings: enColumnSettings,
    columns: enColumns,
    dialogs: enDialogs,
    messages: enMessages,
    mobile: enMobile,
    topbar: enTopbar,
    rateLimit: enRateLimit,
  },
} as const;

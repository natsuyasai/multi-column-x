import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getOsLocale, resolveLanguage } from "@/lib/language";
import { resources } from "./resources";

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage("auto", getOsLocale()),
  fallbackLng: "ja",
  defaultNS: "common",
  ns: [
    "common",
    "settings",
    "columnSettings",
    "columns",
    "dialogs",
    "messages",
    "rateLimit",
  ],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export default i18n;

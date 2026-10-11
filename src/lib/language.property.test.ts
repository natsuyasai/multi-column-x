import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LANGUAGE_SETTINGS,
  normalizeLanguageSetting,
  resolveLanguage,
} from "./language";

describe("language プロパティ", () => {
  it("任意の値に対して normalizeLanguageSetting は必ず対応する言語設定のいずれかを返す", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expect(LANGUAGE_SETTINGS).toContain(normalizeLanguageSetting(value));
      }),
    );
  });

  it("resolveLanguage は任意のOS言語に対して必ず ja か en を返す", () => {
    const osLocaleArb = fc.oneof(
      fc.string(),
      fc.constant(null),
      fc.constant(undefined),
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...LANGUAGE_SETTINGS),
        osLocaleArb,
        (setting, osLocale) => {
          expect(["ja", "en"]).toContain(resolveLanguage(setting, osLocale));
        },
      ),
    );
  });

  it("明示設定(ja/en)のとき resolveLanguage はOS言語に依存せずその言語を返す", () => {
    const osLocaleArb = fc.oneof(
      fc.string(),
      fc.constant(null),
      fc.constant(undefined),
    );
    fc.assert(
      fc.property(
        fc.constantFrom("ja", "en"),
        osLocaleArb,
        (setting, osLocale) => {
          expect(resolveLanguage(setting, osLocale)).toBe(setting);
        },
      ),
    );
  });
});

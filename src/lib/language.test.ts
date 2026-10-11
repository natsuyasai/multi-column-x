import { describe, expect, it } from "vitest";
import { normalizeLanguageSetting, resolveLanguage } from "./language";

describe("言語設定が自動のときOSの言語から表示言語が決まる", () => {
  it.each([
    ["ja", "ja"],
    ["ja-JP", "ja"],
    ["en-US", "en"],
    ["fr-FR", "en"],
    ["zh-CN", "en"],
  ])("OSの言語が %s のとき表示言語は %s になる", (osLocale, expected) => {
    expect(resolveLanguage("auto", osLocale)).toBe(expected);
  });
});

describe("OSの言語が取得できないとき自動設定では英語になる", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["空文字", ""],
  ])("OSの言語が %s のとき表示言語は英語になる", (_label, osLocale) => {
    expect(resolveLanguage("auto", osLocale)).toBe("en");
  });
});

describe("言語設定を明示したときOSの言語に関わらずその言語になる", () => {
  it.each([
    ["ja", "en-US", "ja"],
    ["en", "ja-JP", "en"],
  ] as const)(
    "設定が %s でOSの言語が %s のとき表示言語は %s になる",
    (setting, osLocale, expected) => {
      expect(resolveLanguage(setting, osLocale)).toBe(expected);
    },
  );
});

describe("未対応の値が保存されていたとき言語設定は自動として扱われる", () => {
  it.each([
    ["fr", "fr"],
    ["undefined", undefined],
    ["null", null],
    ["数値", 1],
    ["空文字", ""],
  ])("保存値が %s のとき言語設定は自動になる", (_label, saved) => {
    expect(normalizeLanguageSetting(saved)).toBe("auto");
  });

  it.each(["auto", "ja", "en"])("対応済みの値 %s はそのまま返る", (saved) => {
    expect(normalizeLanguageSetting(saved)).toBe(saved);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";

const TEST_NS = "i18nTest";

// テスト専用の名前空間は型付き辞書に無いため、キー型を緩めた翻訳関数を使う
const translate = (key: string, options: Record<string, unknown>): string =>
  (
    i18n.t as unknown as (
      key: string,
      options: Record<string, unknown>,
    ) => string
  )(key, options);

describe("i18n", () => {
  afterEach(() => {
    i18n.removeResourceBundle("ja", TEST_NS);
    i18n.removeResourceBundle("en", TEST_NS);
  });

  it("辞書に無いキーが指定されたとき日本語の訳文にフォールバックする", async () => {
    i18n.addResourceBundle(
      "ja",
      TEST_NS,
      { onlyJa: "日本語だけの文言" },
      true,
      true,
    );
    await i18n.changeLanguage("en");

    expect(translate("onlyJa", { ns: TEST_NS })).toBe("日本語だけの文言");
  });

  it("補間変数を持つ訳文に値を渡すと文中に埋め込まれる", async () => {
    i18n.addResourceBundle(
      "ja",
      TEST_NS,
      { withCount: "件数: {{count}}件" },
      true,
      true,
    );
    i18n.addResourceBundle(
      "en",
      TEST_NS,
      { withCount: "{{count}} items" },
      true,
      true,
    );
    await i18n.changeLanguage("en");

    expect(translate("withCount", { ns: TEST_NS, count: 3 })).toBe("3 items");
  });
});

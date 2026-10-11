import { describe, it, expect, afterEach } from "vitest";
import i18n from "@/i18n";
import { containsJapanese } from "@/test-utils/japanese";
import {
  getPageTypeLabel,
  getColumnLabel,
  normalizeColumnLabel,
  COLUMN_LABEL_MAX_LENGTH,
  DEFAULT_COLUMN_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
} from "./index";
import type { Column } from "./index";

const baseColumn: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: {
    autoReloadEnabled: true,
    autoReloadInterval: 600,
    showCountdown: true,
    hideHeaderEnabled: true,
    hideTweetInputEnabled: true,
    showCustomMenu: false,
    scrollPosRestoreEnabled: true,
    customCSS: "",
    visibleLinks: [],
    smallImageEnabled: false,
    smallImageWidth: "50%",
    blurImageEnabled: false,
    blurImageAmount: "10px",
    ngWords: [],
    repostHiddenUserIds: [],
    whitelistEnabled: false,
    whitelistWords: [],
    returnToLastReadEnabled: false,
  },
};

describe("getPageTypeLabel", () => {
  it("homeはデフォルトで「ホーム」を返す", () => {
    expect(getPageTypeLabel({ pageType: "home" }, i18n.t)).toBe("ホーム");
  });

  it("homeはhomeTabNameがある場合それを返す", () => {
    expect(
      getPageTypeLabel({ pageType: "home", homeTabName: "フォロー中" }, i18n.t),
    ).toBe("フォロー中");
  });

  it("notificationsは「通知」を返す", () => {
    expect(getPageTypeLabel({ pageType: "notifications" }, i18n.t)).toBe(
      "通知",
    );
  });

  it("searchはクエリがある場合「検索: クエリ」を返す", () => {
    expect(
      getPageTypeLabel({ pageType: "search", searchQuery: "tauri" }, i18n.t),
    ).toBe("検索: tauri");
  });

  it("searchはクエリがない場合「検索」を返す", () => {
    expect(getPageTypeLabel({ pageType: "search" }, i18n.t)).toBe("検索");
  });

  it("listは「リスト」を返す", () => {
    expect(getPageTypeLabel({ pageType: "list" }, i18n.t)).toBe("リスト");
  });

  it("customは「カスタム」を返す", () => {
    expect(getPageTypeLabel({ pageType: "custom" }, i18n.t)).toBe("カスタム");
  });

  it("pageTypeがcomposeのときラベルは投稿を返す", () => {
    expect(getPageTypeLabel({ pageType: "compose" }, i18n.t)).toBe("投稿");
  });

  it("pageTypeがexternalでcustomUrlがある場合ホスト名を含むラベルを返す", () => {
    expect(
      getPageTypeLabel(
        {
          pageType: "external",
          customUrl: "https://example.com/path",
        },
        i18n.t,
      ),
    ).toBe("外部: example.com");
  });

  it("pageTypeがexternalでcustomUrlがない場合外部サイトを返す", () => {
    expect(getPageTypeLabel({ pageType: "external" }, i18n.t)).toBe(
      "外部サイト",
    );
  });

  it("pageTypeがexternalでcustomUrlが不正な形式の場合外部サイトを返す", () => {
    expect(
      getPageTypeLabel(
        { pageType: "external", customUrl: "not-a-url" },
        i18n.t,
      ),
    ).toBe("外部サイト");
  });
});

describe("getColumnLabel", () => {
  it("column.labelがある場合それを返す", () => {
    const col = { ...baseColumn, label: "マイタブ" };
    expect(getColumnLabel(col, i18n.t)).toBe("マイタブ");
  });

  it("column.labelがない場合pageTypeLabelを返す", () => {
    const col = { ...baseColumn, pageType: "notifications" as const };
    expect(getColumnLabel(col, i18n.t)).toBe("通知");
  });

  it("homeはhomeTabNameを反映する", () => {
    const col = { ...baseColumn, homeTabName: "フォロー中" };
    expect(getColumnLabel(col, i18n.t)).toBe("フォロー中");
  });

  it("labelが空文字のときページ種別ラベルを返す", () => {
    const col = {
      ...baseColumn,
      label: "",
      pageType: "notifications" as const,
    };
    expect(getColumnLabel(col, i18n.t)).toBe("通知");
  });
});

describe("normalizeColumnLabel", () => {
  it("通常の文字列はそのまま返す", () => {
    expect(normalizeColumnLabel("マイタブ")).toBe("マイタブ");
  });

  it("前後の半角空白を除去する", () => {
    expect(normalizeColumnLabel("  マイタブ  ")).toBe("マイタブ");
  });

  it("前後の全角空白を除去する", () => {
    expect(normalizeColumnLabel("　マイタブ　")).toBe("マイタブ");
  });

  it("内部の空白は保持する", () => {
    expect(normalizeColumnLabel("マイ タブ")).toBe("マイ タブ");
  });

  it("空文字はundefinedを返す", () => {
    expect(normalizeColumnLabel("")).toBeUndefined();
  });

  it("空白のみはundefinedを返す", () => {
    expect(normalizeColumnLabel("  ")).toBeUndefined();
  });

  it("全角空白のみはundefinedを返す", () => {
    expect(normalizeColumnLabel("　")).toBeUndefined();
  });
});

describe("COLUMN_LABEL_MAX_LENGTH", () => {
  it("値が30である", () => {
    expect(COLUMN_LABEL_MAX_LENGTH).toBe(30);
  });
});

describe("DEFAULT_COLUMN_SETTINGS", () => {
  it("ngWordsのデフォルト値は空配列", () => {
    expect(DEFAULT_COLUMN_SETTINGS.ngWords).toEqual([]);
  });

  it("repostHiddenUserIdsのデフォルト値は空配列", () => {
    expect(DEFAULT_COLUMN_SETTINGS.repostHiddenUserIds).toEqual([]);
  });

  it("新しく追加したカラムでは戻るボタン設定がOFFになっている", () => {
    expect(DEFAULT_COLUMN_SETTINGS.returnToLastReadEnabled).toBe(false);
  });
});

describe("DEFAULT_GLOBAL_SETTINGS", () => {
  it("presetsのデフォルト値は空配列", () => {
    expect(DEFAULT_GLOBAL_SETTINGS.presets).toEqual([]);
  });

  it("ngWordsのデフォルト値は空配列", () => {
    expect(DEFAULT_GLOBAL_SETTINGS.ngWords).toEqual([]);
  });

  it("repostHiddenUserIdsのデフォルト値は空配列", () => {
    expect(DEFAULT_GLOBAL_SETTINGS.repostHiddenUserIds).toEqual([]);
  });
});

describe("英語表示のページ種別ラベル", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it.each([
    [{ pageType: "home" }, "Home"],
    [{ pageType: "notifications" }, "Notifications"],
    [{ pageType: "search" }, "Search"],
    [{ pageType: "list" }, "Lists"],
    [{ pageType: "custom" }, "Custom"],
    [{ pageType: "external" }, "External site"],
    [{ pageType: "compose" }, "Compose"],
  ] as const)(
    "表示言語が英語のとき%oは英語のラベルを返す",
    async (input, expected) => {
      await i18n.changeLanguage("en");

      expect(getPageTypeLabel(input, i18n.t)).toBe(expected);
    },
  );

  it("検索クエリは英語の語順で文中に埋め込まれる", async () => {
    await i18n.changeLanguage("en");

    expect(
      getPageTypeLabel({ pageType: "search", searchQuery: "tauri" }, i18n.t),
    ).toBe("Search: tauri");
  });

  it("外部サイトのホスト名は英語の語順で文中に埋め込まれる", async () => {
    await i18n.changeLanguage("en");

    expect(
      getPageTypeLabel(
        { pageType: "external", customUrl: "https://example.com/path" },
        i18n.t,
      ),
    ).toBe("External: example.com");
  });

  it("column.labelがある場合は表示言語によらずそのまま返す", async () => {
    await i18n.changeLanguage("en");

    expect(getColumnLabel({ ...baseColumn, label: "マイタブ" }, i18n.t)).toBe(
      "マイタブ",
    );
  });

  it("すべてのページ種別で英語のラベルに日本語が含まれない", async () => {
    await i18n.changeLanguage("en");

    for (const pageType of [
      "home",
      "notifications",
      "search",
      "list",
      "custom",
      "external",
      "compose",
    ] as const) {
      const label = getPageTypeLabel(
        { pageType, searchQuery: "q", customUrl: "https://example.com" },
        i18n.t,
      );
      expect(containsJapanese(label), label).toBe(false);
    }
  });
});

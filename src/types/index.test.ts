import { describe, it, expect } from "vitest";
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
    expect(getPageTypeLabel({ pageType: "home" })).toBe("ホーム");
  });

  it("homeはhomeTabNameがある場合それを返す", () => {
    expect(
      getPageTypeLabel({ pageType: "home", homeTabName: "フォロー中" }),
    ).toBe("フォロー中");
  });

  it("notificationsは「通知」を返す", () => {
    expect(getPageTypeLabel({ pageType: "notifications" })).toBe("通知");
  });

  it("searchはクエリがある場合「検索: クエリ」を返す", () => {
    expect(getPageTypeLabel({ pageType: "search", searchQuery: "tauri" })).toBe(
      "検索: tauri",
    );
  });

  it("searchはクエリがない場合「検索」を返す", () => {
    expect(getPageTypeLabel({ pageType: "search" })).toBe("検索");
  });

  it("listは「リスト」を返す", () => {
    expect(getPageTypeLabel({ pageType: "list" })).toBe("リスト");
  });

  it("customは「カスタム」を返す", () => {
    expect(getPageTypeLabel({ pageType: "custom" })).toBe("カスタム");
  });

  it("pageTypeがcomposeのときラベルは投稿を返す", () => {
    expect(getPageTypeLabel({ pageType: "compose" })).toBe("投稿");
  });

  it("pageTypeがexternalでcustomUrlがある場合ホスト名を含むラベルを返す", () => {
    expect(
      getPageTypeLabel({
        pageType: "external",
        customUrl: "https://example.com/path",
      }),
    ).toBe("外部: example.com");
  });

  it("pageTypeがexternalでcustomUrlがない場合外部サイトを返す", () => {
    expect(getPageTypeLabel({ pageType: "external" })).toBe("外部サイト");
  });

  it("pageTypeがexternalでcustomUrlが不正な形式の場合外部サイトを返す", () => {
    expect(
      getPageTypeLabel({ pageType: "external", customUrl: "not-a-url" }),
    ).toBe("外部サイト");
  });
});

describe("getColumnLabel", () => {
  it("column.labelがある場合それを返す", () => {
    const col = { ...baseColumn, label: "マイタブ" };
    expect(getColumnLabel(col)).toBe("マイタブ");
  });

  it("column.labelがない場合pageTypeLabelを返す", () => {
    const col = { ...baseColumn, pageType: "notifications" as const };
    expect(getColumnLabel(col)).toBe("通知");
  });

  it("homeはhomeTabNameを反映する", () => {
    const col = { ...baseColumn, homeTabName: "フォロー中" };
    expect(getColumnLabel(col)).toBe("フォロー中");
  });

  it("labelが空文字のときページ種別ラベルを返す", () => {
    const col = {
      ...baseColumn,
      label: "",
      pageType: "notifications" as const,
    };
    expect(getColumnLabel(col)).toBe("通知");
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

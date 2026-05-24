import { describe, it, expect } from "vitest";
import {
  resolveColumnUrl,
  getPageTypeLabel,
  getColumnLabel,
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
    areaRemoveEnabled: true,
    showCustomMenu: false,
    scrollPosRestoreEnabled: true,
    customCSS: "",
    visibleLinks: [],
    smallImageEnabled: false,
    smallImageWidth: "50%",
    blurImageEnabled: false,
    blurImageAmount: "10px",
    ngWords: [],
  },
};

describe("resolveColumnUrl", () => {
  it("homeページのURLを返す", () => {
    expect(resolveColumnUrl({ pageType: "home" })).toBe("https://x.com/home");
  });

  it("notificationsページのURLを返す", () => {
    expect(resolveColumnUrl({ pageType: "notifications" })).toBe(
      "https://x.com/notifications",
    );
  });

  it("searchページのURLをクエリ付きで返す", () => {
    expect(resolveColumnUrl({ pageType: "search", searchQuery: "tauri" })).toBe(
      "https://x.com/search?q=tauri",
    );
  });

  it("listページのURLをリストID付きで返す", () => {
    expect(resolveColumnUrl({ pageType: "list", listId: "12345" })).toBe(
      "https://x.com/i/lists/12345",
    );
  });

  it("customページのURLをそのまま返す", () => {
    expect(
      resolveColumnUrl({
        pageType: "custom",
        customUrl: "https://x.com/explore",
      }),
    ).toBe("https://x.com/explore");
  });
});

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
});

describe("DEFAULT_COLUMN_SETTINGS", () => {
  it("ngWordsのデフォルト値は空配列", () => {
    expect(DEFAULT_COLUMN_SETTINGS.ngWords).toEqual([]);
  });
});

describe("DEFAULT_GLOBAL_SETTINGS", () => {
  it("presetsのデフォルト値は空配列", () => {
    expect(DEFAULT_GLOBAL_SETTINGS.presets).toEqual([]);
  });

  it("ngWordsのデフォルト値は空配列", () => {
    expect(DEFAULT_GLOBAL_SETTINGS.ngWords).toEqual([]);
  });
});

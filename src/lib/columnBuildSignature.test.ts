import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLUMN_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
  type Column,
} from "@/types";
import { columnBuildSignature } from "./columnBuildSignature";

const column: Column = {
  id: "c1",
  accountId: "a1",
  pageType: "home",
  width: 400,
  order: 0,
  settings: { ...DEFAULT_COLUMN_SETTINGS },
  gridRow: 0,
  gridCol: 0,
  heightMode: "auto",
};

describe("columnBuildSignature", () => {
  it("埋め込みに無関係な全体設定の項目だけ変えても署名が変わらない", () => {
    const before = columnBuildSignature(column, DEFAULT_GLOBAL_SETTINGS);
    const after = columnBuildSignature(column, {
      ...DEFAULT_GLOBAL_SETTINGS,
      theme: DEFAULT_GLOBAL_SETTINGS.theme === "dark" ? "light" : "dark",
    });
    expect(after).toBe(before);
  });

  it("再構築では設定上のURLから読み込み直されるのでURL決定要素が署名に含まれる", () => {
    const base = columnBuildSignature(column, DEFAULT_GLOBAL_SETTINGS);
    const variants: Partial<Column>[] = [
      { pageType: "search" },
      { customUrl: "https://example.com" },
      { homeTabName: "フォロー中" },
      { searchQuery: "tauri" },
      { searchLiveTab: true },
      { listId: "123" },
    ];
    for (const v of variants) {
      expect(
        columnBuildSignature({ ...column, ...v }, DEFAULT_GLOBAL_SETTINGS),
      ).not.toBe(base);
    }
  });

  it("ぼかし設定を変えると署名が変わる", () => {
    const before = columnBuildSignature(column, DEFAULT_GLOBAL_SETTINGS);
    const after = columnBuildSignature(
      {
        ...column,
        settings: {
          ...column.settings,
          blurImageEnabled: !column.settings.blurImageEnabled,
        },
      },
      DEFAULT_GLOBAL_SETTINGS,
    );
    expect(after).not.toBe(before);
  });

  it("旧データで repostHiddenUserIds が無くても空配列と同じ署名になる", () => {
    const legacy = {
      ...column,
      settings: { ...column.settings, repostHiddenUserIds: undefined },
    } as unknown as Column;
    const empty = {
      ...column,
      settings: { ...column.settings, repostHiddenUserIds: [] },
    };
    expect(columnBuildSignature(legacy, DEFAULT_GLOBAL_SETTINGS)).toBe(
      columnBuildSignature(empty, DEFAULT_GLOBAL_SETTINGS),
    );
  });
});

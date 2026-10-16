import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_COLUMN_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
  type Column,
} from "@/types";
import {
  clearColumnBuild,
  isColumnBuildStale,
  recordColumnBuild,
  resetColumnBuildRegistry,
} from "./columnBuildRegistry";
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
const global = DEFAULT_GLOBAL_SETTINGS;

const changed: Column = {
  ...column,
  settings: {
    ...column.settings,
    blurImageEnabled: true,
    blurImageAmount: "9",
  },
};

describe("columnBuildRegistry", () => {
  beforeEach(() => resetColumnBuildRegistry());

  it("構築記録が無いカラムは stale にならない", () => {
    expect(isColumnBuildStale(column, global)).toBe(false);
  });

  it("構築した直後は stale にならない", () => {
    recordColumnBuild(column.id, columnBuildSignature(column, global));
    expect(isColumnBuildStale(column, global)).toBe(false);
  });

  it("構築後に埋め込み設定が変わると stale になる", () => {
    recordColumnBuild(column.id, columnBuildSignature(column, global));
    expect(isColumnBuildStale(changed, global)).toBe(true);
  });

  it("再構築した後は再び変更されるまで stale にならない", () => {
    recordColumnBuild(column.id, columnBuildSignature(column, global));
    expect(isColumnBuildStale(changed, global)).toBe(true);
    recordColumnBuild(changed.id, columnBuildSignature(changed, global));
    expect(isColumnBuildStale(changed, global)).toBe(false);
  });

  it("記録を消すと stale にならない", () => {
    recordColumnBuild(column.id, columnBuildSignature(column, global));
    clearColumnBuild(column.id);
    expect(isColumnBuildStale(changed, global)).toBe(false);
  });
});

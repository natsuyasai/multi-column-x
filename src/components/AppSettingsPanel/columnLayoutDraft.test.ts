import { describe, it, expect } from "vitest";
import {
  isAssignedWithin,
  findColumnAtCell,
  rowCountForCol,
  assignToCell,
  unassign,
  unassignBeyond,
  setHeight,
} from "@/components/AppSettingsPanel/columnLayoutDraft";
import type { Column } from "@/types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
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
};

function makeColumn(overrides: Partial<Column>): Column {
  return {
    id: "c1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
    ...overrides,
  };
}

describe("isAssignedWithin", () => {
  it("gridRowとgridColが1以上かつgridColがcols以下のとき true を返す", () => {
    const column = makeColumn({ gridRow: 1, gridCol: 2 });
    expect(isAssignedWithin(column, 2)).toBe(true);
  });

  it("gridColがcolsを超えるとき false を返す", () => {
    const column = makeColumn({ gridRow: 1, gridCol: 3 });
    expect(isAssignedWithin(column, 2)).toBe(false);
  });

  it("gridRowが0以下のとき false を返す", () => {
    const column = makeColumn({ gridRow: 0, gridCol: 1 });
    expect(isAssignedWithin(column, 2)).toBe(false);
  });

  it("gridColが0以下のとき false を返す", () => {
    const column = makeColumn({ gridRow: 1, gridCol: 0 });
    expect(isAssignedWithin(column, 2)).toBe(false);
  });
});

describe("findColumnAtCell", () => {
  it("指定したrow・gridColに一致するカラムを返す", () => {
    const target = makeColumn({ id: "c1", gridRow: 2, gridCol: 3 });
    const columns = [makeColumn({ id: "c0", gridRow: 1, gridCol: 1 }), target];
    expect(findColumnAtCell(columns, 2, 3)).toBe(target);
  });

  it("一致するカラムが無いとき null を返す", () => {
    const columns = [makeColumn({ id: "c0", gridRow: 1, gridCol: 1 })];
    expect(findColumnAtCell(columns, 9, 9)).toBeNull();
  });

  it("未割当（gridRowまたはgridColが0）のカラムは対象にしない", () => {
    const columns = [makeColumn({ id: "c0", gridRow: 0, gridCol: 0 })];
    expect(findColumnAtCell(columns, 0, 0)).toBeNull();
  });
});

describe("rowCountForCol", () => {
  it("指定列に割り当てられたカラムの最大gridRowを返す", () => {
    const columns = [
      makeColumn({ id: "c1", gridRow: 1, gridCol: 1 }),
      makeColumn({ id: "c2", gridRow: 2, gridCol: 1 }),
    ];
    expect(rowCountForCol(columns, 1)).toBe(2);
  });

  it("指定列に割り当てられたカラムが無いとき1を返す", () => {
    const columns = [makeColumn({ id: "c1", gridRow: 1, gridCol: 2 })];
    expect(rowCountForCol(columns, 1)).toBe(1);
  });
});

describe("assignToCell", () => {
  it("指定したidのカラムに指定セルのgridRow・gridColを設定する", () => {
    const columns = [makeColumn({ id: "c1", gridRow: 0, gridCol: 0 })];
    const result = assignToCell(columns, "c1", { row: 3, col: 4 });
    expect(result[0]).toMatchObject({ id: "c1", gridRow: 3, gridCol: 4 });
  });

  it("idが一致しないカラムは同一参照のまま変更されない", () => {
    const other = makeColumn({ id: "c2", gridRow: 1, gridCol: 1 });
    const columns = [makeColumn({ id: "c1" }), other];
    const result = assignToCell(columns, "c1", { row: 3, col: 4 });
    expect(result[1]).toBe(other);
  });
});

describe("unassign", () => {
  it("指定したidのカラムのgridRow・gridColを0にする", () => {
    const columns = [makeColumn({ id: "c1", gridRow: 2, gridCol: 3 })];
    const result = unassign(columns, "c1");
    expect(result[0]).toMatchObject({ id: "c1", gridRow: 0, gridCol: 0 });
  });
});

describe("unassignBeyond", () => {
  it("gridColがcolsを超えるカラムを0/0にする", () => {
    const columns = [
      makeColumn({ id: "c1", gridRow: 1, gridCol: 1 }),
      makeColumn({ id: "c2", gridRow: 1, gridCol: 3 }),
    ];
    const result = unassignBeyond(columns, 2);
    const c2 = result.find((c) => c.id === "c2")!;
    expect(c2.gridRow).toBe(0);
    expect(c2.gridCol).toBe(0);
  });

  it("gridColがcols以内のカラムは変更しない", () => {
    const c1 = makeColumn({ id: "c1", gridRow: 1, gridCol: 1 });
    const result = unassignBeyond([c1], 2);
    expect(result[0]).toBe(c1);
  });
});

describe("setHeight", () => {
  it("指定したidのカラムのheightMode・heightValue・heightUnitを設定する", () => {
    const columns = [makeColumn({ id: "c1", heightMode: "auto" })];
    const result = setHeight(columns, "c1", "fixed", 400, "px");
    expect(result[0]).toMatchObject({
      id: "c1",
      heightMode: "fixed",
      heightValue: 400,
      heightUnit: "px",
    });
  });

  it("autoに設定するとvalue・unitを渡さない限りundefinedになる", () => {
    const columns = [
      makeColumn({
        id: "c1",
        heightMode: "fixed",
        heightValue: 400,
        heightUnit: "px",
      }),
    ];
    const result = setHeight(columns, "c1", "auto");
    expect(result[0]).toMatchObject({
      heightMode: "auto",
      heightValue: undefined,
      heightUnit: undefined,
    });
  });
});

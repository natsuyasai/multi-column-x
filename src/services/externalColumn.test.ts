import { invoke } from "@tauri-apps/api/core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Account, Column } from "../types";
import { isExternalColumn, resolveColumnDataDirectory } from "./externalColumn";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function createColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: "col-1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: {
      hideHeaderEnabled: false,
      hideTweetInputEnabled: false,
      customCSS: "",
      ngWords: [],
    },
    ...overrides,
  } as Column;
}

describe("externalColumn service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isExternalColumn", () => {
    it("pageTypeがexternalの場合trueを返す", () => {
      const column = createColumn({ pageType: "external" });
      expect(isExternalColumn(column)).toBe(true);
    });

    it("pageTypeがexternal以外の場合falseを返す", () => {
      const column = createColumn({ pageType: "home" });
      expect(isExternalColumn(column)).toBe(false);
    });
  });

  describe("resolveColumnDataDirectory", () => {
    it("externalカラムの場合get_external_column_data_directoryをcolumnIdで呼び出しその戻り値を返す", async () => {
      const column = createColumn({ id: "col-external", pageType: "external" });
      vi.mocked(invoke).mockResolvedValue("/data/external/col-external");

      const result = await resolveColumnDataDirectory(column, []);

      expect(invoke).toHaveBeenCalledWith(
        "get_external_column_data_directory",
        { columnId: "col-external" },
      );
      expect(result).toBe("/data/external/col-external");
    });

    it("external以外のカラムでaccountが見つかる場合そのdataDirectoryを返す", async () => {
      const column = createColumn({ accountId: "acc-1", pageType: "home" });
      const accounts: Account[] = [
        { id: "acc-1", dataDirectory: "/data/acc-1" } as Account,
      ];

      const result = await resolveColumnDataDirectory(column, accounts);

      expect(result).toBe("/data/acc-1");
    });

    it("external以外のカラムでaccountが見つからない場合undefinedを返す", async () => {
      const column = createColumn({ accountId: "acc-missing", pageType: "home" });
      const accounts: Account[] = [
        { id: "acc-1", dataDirectory: "/data/acc-1" } as Account,
      ];

      const result = await resolveColumnDataDirectory(column, accounts);

      expect(result).toBeUndefined();
    });

    it("external以外のカラムの場合invokeを呼ばない", async () => {
      const column = createColumn({ accountId: "acc-1", pageType: "home" });
      const accounts: Account[] = [
        { id: "acc-1", dataDirectory: "/data/acc-1" } as Account,
      ];

      await resolveColumnDataDirectory(column, accounts);

      expect(invoke).not.toHaveBeenCalled();
    });
  });
});

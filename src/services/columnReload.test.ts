import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import {
  recordColumnBuild,
  resetColumnBuildRegistry,
} from "@/lib/columnBuildRegistry";
import { columnBuildSignature } from "@/lib/columnBuildSignature";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Column } from "@/types";
import { reloadColumnOrRecreate } from "./columnReload";
import { evalInColumn } from "./columnWebview";

vi.mock("./columnWebview", () => ({
  evalInColumn: vi.fn().mockResolvedValue(undefined),
}));

const column = {
  id: "c1",
  order: 0,
  accountId: "acc-1",
  pageType: "home",
  settings: { ...DEFAULT_COLUMN_SETTINGS },
} as Column;

describe("reloadColumnOrRecreate（モバイルのページ再読み込みを含む）", () => {
  beforeEach(() => {
    vi.mocked(evalInColumn).mockClear();
    resetColumnBuildRegistry();
    useAppStore.setState({
      columns: [column],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
    });
  });

  it("設定が変わったカラムはモバイルのページ再読み込みでも再構築される", async () => {
    recordColumnBuild(
      column.id,
      columnBuildSignature(column, DEFAULT_GLOBAL_SETTINGS),
    );
    useAppStore.setState({
      columns: [
        { ...column, settings: { ...column.settings, blurImageEnabled: true } },
      ],
    });
    const recreate = vi.fn().mockResolvedValue(undefined);

    await reloadColumnOrRecreate("c1", WEBVIEW_SCRIPTS.RELOAD_PAGE, recreate);

    expect(recreate).toHaveBeenCalledWith("c1");
    expect(evalInColumn).not.toHaveBeenCalled();
  });

  it("設定が変わっていないカラムはモバイルのページ再読み込みで再構築されない", async () => {
    recordColumnBuild(
      column.id,
      columnBuildSignature(column, DEFAULT_GLOBAL_SETTINGS),
    );
    const recreate = vi.fn().mockResolvedValue(undefined);

    await reloadColumnOrRecreate("c1", WEBVIEW_SCRIPTS.RELOAD_PAGE, recreate);

    expect(recreate).not.toHaveBeenCalled();
    expect(evalInColumn).toHaveBeenCalledWith(
      "c1",
      WEBVIEW_SCRIPTS.RELOAD_PAGE,
    );
  });

  it("再構築関数が無い場合は設定が古くても従来どおり再読み込みされる", async () => {
    recordColumnBuild(column.id, "古い署名");

    await reloadColumnOrRecreate("c1", WEBVIEW_SCRIPTS.RELOAD_PAGE);

    expect(evalInColumn).toHaveBeenCalledWith(
      "c1",
      WEBVIEW_SCRIPTS.RELOAD_PAGE,
    );
  });
});

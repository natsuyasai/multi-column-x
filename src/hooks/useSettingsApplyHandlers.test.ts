import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import { evalInColumn } from "@/services/columnWebview";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS } from "@/types";
import type { Column } from "@/types";
import { useSettingsApplyHandlers } from "./useSettingsApplyHandlers";

vi.mock("@/services/columnWebview", () => ({
  buildGlobalNgScripts: vi.fn(() => []),
  evalInColumn: vi.fn(),
}));

const SET_EN = WEBVIEW_SCRIPTS.setInjectLanguage("en");
const SET_JA = WEBVIEW_SCRIPTS.setInjectLanguage("ja");

function setup(
  overrides: Partial<Parameters<typeof useSettingsApplyHandlers>[0]> = {},
) {
  const { result } = renderHook(() =>
    useSettingsApplyHandlers({
      handleUpdateColumn: vi.fn(),
      setSettingsColumnId: vi.fn(),
      updateGlobalSettings: vi.fn(),
      recreateColumnWebview: vi.fn().mockResolvedValue(undefined),
      recreateStaleColumns: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }),
  );
  return result.current;
}

describe("設定画面で表示言語を適用すると開いているカラムの注入UIも即座に切り替わる", () => {
  beforeEach(() => {
    vi.mocked(evalInColumn).mockClear();
    useAppStore.setState({
      columns: [{ id: "col-1" }, { id: "col-2" }] as Column[],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("英語を適用すると全カラムへ英語に切り替えるスクリプトが送られる", () => {
    setup().handleApplyGlobalSettings({ language: "en" });

    expect(evalInColumn).toHaveBeenCalledWith("col-1", SET_EN);
    expect(evalInColumn).toHaveBeenCalledWith("col-2", SET_EN);
  });

  it("日本語を適用すると全カラムへ日本語に切り替えるスクリプトが送られる", () => {
    setup().handleApplyGlobalSettings({ language: "ja" });

    expect(evalInColumn).toHaveBeenCalledWith("col-1", SET_JA);
    expect(evalInColumn).toHaveBeenCalledWith("col-2", SET_JA);
  });

  it("自動のときOSの言語が日本語なら日本語に切り替える", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");

    setup().handleApplyGlobalSettings({ language: "auto" });

    expect(evalInColumn).toHaveBeenCalledWith("col-1", SET_JA);
    expect(evalInColumn).toHaveBeenCalledWith("col-2", SET_JA);
  });

  it("自動のときOSの言語が日本語以外なら英語に切り替える", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");

    setup().handleApplyGlobalSettings({ language: "auto" });

    expect(evalInColumn).toHaveBeenCalledWith("col-1", SET_EN);
    expect(evalInColumn).toHaveBeenCalledWith("col-2", SET_EN);
  });

  it("言語を含まない変更ではカラムの表示言語を切り替えない", () => {
    setup().handleApplyGlobalSettings({ ngWords: ["x"] });

    expect(evalInColumn).not.toHaveBeenCalled();
  });
});

describe("カラム個別設定の適用", () => {
  it("カラム個別設定を適用すると当該カラムだけが再構築される", async () => {
    const recreateColumnWebview = vi.fn().mockResolvedValue(undefined);

    await setup({ recreateColumnWebview }).handleApplySettings(
      "col-A",
      DEFAULT_COLUMN_SETTINGS,
      350,
      undefined,
    );

    expect(recreateColumnWebview).toHaveBeenCalledTimes(1);
    expect(recreateColumnWebview).toHaveBeenCalledWith("col-A");
    expect(recreateColumnWebview).not.toHaveBeenCalledWith("col-B");
  });

  it("カラム個別設定の適用後は設定の更新が再構築より先に行われる", async () => {
    const order: string[] = [];
    const handleUpdateColumn = vi.fn(() => {
      order.push("update");
    });
    const setSettingsColumnId = vi.fn(() => {
      order.push("close");
    });
    const recreateColumnWebview = vi.fn(async () => {
      order.push("recreate");
    });

    await setup({
      handleUpdateColumn,
      setSettingsColumnId,
      recreateColumnWebview,
    }).handleApplySettings("col-A", DEFAULT_COLUMN_SETTINGS, 350, "ラベル");

    expect(handleUpdateColumn).toHaveBeenCalledWith("col-A", {
      settings: DEFAULT_COLUMN_SETTINGS,
      width: 350,
      label: "ラベル",
    });
    expect(order).toEqual(["update", "close", "recreate"]);
  });
});

describe("全体設定の適用", () => {
  beforeEach(() => {
    vi.mocked(evalInColumn).mockClear();
    useAppStore.setState({
      columns: [{ id: "col-1" }, { id: "col-2" }] as Column[],
    });
  });

  it("全体設定を適用すると全体設定の更新の後に古くなったカラムが再構築される", async () => {
    const order: string[] = [];
    const updateGlobalSettings = vi.fn(() => {
      order.push("update");
    });
    const recreateStaleColumns = vi.fn(async () => {
      order.push("recreateStale");
    });

    await setup({
      updateGlobalSettings,
      recreateStaleColumns,
    }).handleApplyGlobalSettings({ blurImageEnabled: true });

    expect(recreateStaleColumns).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["update", "recreateStale"]);
  });

  it("埋め込みに無関係な全体設定だけ変えても個別カラムの再構築は呼ばれない", async () => {
    const recreateColumnWebview = vi.fn().mockResolvedValue(undefined);

    await setup({ recreateColumnWebview }).handleApplyGlobalSettings({
      theme: "dark",
    });

    expect(recreateColumnWebview).not.toHaveBeenCalled();
    expect(evalInColumn).toHaveBeenCalledWith(
      "col-1",
      WEBVIEW_SCRIPTS.applyNightModeCookie("2"),
    );
  });

  it("古くなったカラムの再構築が失敗しても未処理の例外にならない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recreateStaleColumns = vi.fn().mockRejectedValue(new Error("失敗"));

    await expect(
      setup({ recreateStaleColumns }).handleApplyGlobalSettings({
        ngWords: ["x"],
      }),
    ).resolves.toBeUndefined();
  });
});

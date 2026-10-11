import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import { evalInColumn } from "@/services/columnWebview";
import { useAppStore } from "@/store/useAppStore";
import type { Column } from "@/types";
import { useSettingsApplyHandlers } from "./useSettingsApplyHandlers";

vi.mock("@/services/columnWebview", () => ({
  applyColumnSettingsScripts: vi.fn(),
  buildGlobalNgScripts: vi.fn(() => []),
  evalInColumn: vi.fn(),
}));

const SET_EN = WEBVIEW_SCRIPTS.setInjectLanguage("en");
const SET_JA = WEBVIEW_SCRIPTS.setInjectLanguage("ja");

function setup() {
  const { result } = renderHook(() =>
    useSettingsApplyHandlers({
      handleUpdateColumn: vi.fn(),
      setSettingsColumnId: vi.fn(),
      updateGlobalSettings: vi.fn(),
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

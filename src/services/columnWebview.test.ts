import { invoke } from "@tauri-apps/api/core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WEBVIEW_SCRIPTS } from "../constants/ipc";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "../types";
import type { Column } from "../types";
import {
  applyColumnSettingsScripts,
  buildGlobalNgScripts,
  createColumnWebview,
  flashMobileSwipeBar,
  removeColumnWebview,
  resizeColumnWebview,
  setColumnCookies,
  updateMobileSwipeBar,
} from "./columnWebview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("columnWebview service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("createColumnWebviewはcolumnとdataDirectoryとboundsをargsにまとめて送る", async () => {
    const column = {
      id: "col-1",
      accountId: "acc-1",
      pageType: "home",
      width: 350,
      order: 0,
      gridRow: 1,
      gridCol: 1,
      heightMode: "auto",
      settings: DEFAULT_COLUMN_SETTINGS,
    } as Column;
    await createColumnWebview(column, "/data/acc-1", {
      x: 0,
      y: 36,
      width: 350,
      height: 800,
    });
    expect(invoke).toHaveBeenCalledWith("create_column_webview", {
      args: {
        column,
        dataDirectory: "/data/acc-1",
        x: 0,
        y: 36,
        width: 350,
        height: 800,
      },
    });
  });

  it("resizeColumnWebviewはcolumnIdとboundsをまとめて送る", async () => {
    await resizeColumnWebview("col-1", {
      x: 0,
      y: 36,
      width: 400,
      height: 800,
    });
    expect(invoke).toHaveBeenCalledWith("resize_column_webview", {
      bounds: { columnId: "col-1", x: 0, y: 36, width: 400, height: 800 },
    });
  });

  it("removeColumnWebviewはcolumnIdを送る", async () => {
    await removeColumnWebview("col-1");
    expect(invoke).toHaveBeenCalledWith("remove_column_webview", {
      columnId: "col-1",
    });
  });

  it("setColumnCookiesはaccountIdを送る", async () => {
    await setColumnCookies("acc-1");
    expect(invoke).toHaveBeenCalledWith("set_column_cookies", {
      accountId: "acc-1",
    });
  });

  it("updateMobileSwipeBarはvisible/y/height/opacity/darkThemeをまとめて送る", async () => {
    await updateMobileSwipeBar(true, 700, 28, 50, true);
    expect(invoke).toHaveBeenCalledWith("update_mobile_swipe_bar", {
      visible: true,
      y: 700,
      height: 28,
      opacity: 50,
      darkTheme: true,
    });
  });

  it("updateMobileSwipeBarはvisible:falseや透過度0もそのまま送る", async () => {
    await updateMobileSwipeBar(false, 800, 28, 0, false);
    expect(invoke).toHaveBeenCalledWith("update_mobile_swipe_bar", {
      visible: false,
      y: 800,
      height: 28,
      opacity: 0,
      darkTheme: false,
    });
  });

  it("flashMobileSwipeBarはdirectionを送る", async () => {
    await flashMobileSwipeBar("left");
    expect(invoke).toHaveBeenCalledWith("flash_mobile_swipe_bar", {
      direction: "left",
    });
    await flashMobileSwipeBar("right");
    expect(invoke).toHaveBeenCalledWith("flash_mobile_swipe_bar", {
      direction: "right",
    });
  });

  it("applyColumnSettingsScriptsは5つのスクリプトを順に適用する", async () => {
    await applyColumnSettingsScripts(
      "col-1",
      { ...DEFAULT_COLUMN_SETTINGS, repostHiddenUserIds: ["col_user"] },
      ["ng"],
      ["global_user"],
    );
    expect(invoke).toHaveBeenCalledTimes(5);
    const labels = vi
      .mocked(invoke)
      .mock.calls.map((c) => (c[1] as { label: string }).label);
    expect(labels.every((l) => l === "column-col-1")).toBe(true);
    const scripts = vi
      .mocked(invoke)
      .mock.calls.map((c) => (c[1] as { script: string }).script);
    expect(scripts[0]).toBe(
      WEBVIEW_SCRIPTS.applyAreaVisibility(
        DEFAULT_COLUMN_SETTINGS.hideHeaderEnabled,
        DEFAULT_COLUMN_SETTINGS.hideTweetInputEnabled,
      ),
    );
    expect(scripts[1]).toBe(
      WEBVIEW_SCRIPTS.applyCustomCSS(DEFAULT_COLUMN_SETTINGS.customCSS),
    );
    expect(scripts[2]).toBe(
      WEBVIEW_SCRIPTS.applyNgWords(
        DEFAULT_COLUMN_SETTINGS.ngWords,
        ["ng"],
        ["col_user"],
        ["global_user"],
      ),
    );
    expect(scripts[3]).toBe(
      WEBVIEW_SCRIPTS.applyWhitelist(
        DEFAULT_COLUMN_SETTINGS.whitelistEnabled,
        DEFAULT_COLUMN_SETTINGS.whitelistWords,
      ),
    );
    expect(scripts[4]).toBe(WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD);
  });

  it("evalInColumn経由の失敗はapplyColumnSettingsScriptsを中断しない", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("eval failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await applyColumnSettingsScripts("col-1", DEFAULT_COLUMN_SETTINGS, [], []);
    expect(invoke).toHaveBeenCalledTimes(5);
    consoleError.mockRestore();
  });

  it("applyColumnSettingsScriptsは旧データでカラム個別のIDが無くても空配列として適用する", async () => {
    const legacy = {
      ...DEFAULT_COLUMN_SETTINGS,
    } as Partial<typeof DEFAULT_COLUMN_SETTINGS>;
    delete legacy.repostHiddenUserIds;
    await applyColumnSettingsScripts(
      "col-1",
      legacy as typeof DEFAULT_COLUMN_SETTINGS,
      [],
      ["g"],
    );
    const scripts = vi
      .mocked(invoke)
      .mock.calls.map((c) => (c[1] as { script: string }).script);
    expect(scripts[2]).toBe(
      WEBVIEW_SCRIPTS.applyNgWords(
        DEFAULT_COLUMN_SETTINGS.ngWords,
        [],
        [],
        ["g"],
      ),
    );
  });
});

describe("buildGlobalNgScripts", () => {
  const columns = [
    {
      id: "c1",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        ngWords: ["colng1"],
        repostHiddenUserIds: ["col1"],
      },
    },
    {
      id: "c2",
      settings: { ...DEFAULT_COLUMN_SETTINGS, ngWords: ["colng2"] },
    },
  ] as Column[];
  const current = {
    ...DEFAULT_GLOBAL_SETTINGS,
    ngWords: ["gng"],
    repostHiddenUserIds: ["guser"],
  };

  it("全体のリポスト非表示ユーザーIDの変更が全カラムへ反映される", () => {
    const result = buildGlobalNgScripts(
      { repostHiddenUserIds: ["newuser"] },
      current,
      columns,
    );
    expect(result).toEqual([
      {
        columnId: "c1",
        script: WEBVIEW_SCRIPTS.applyNgWords(
          ["colng1"],
          ["gng"],
          ["col1"],
          ["newuser"],
        ),
      },
      {
        columnId: "c2",
        script: WEBVIEW_SCRIPTS.applyNgWords(
          ["colng2"],
          ["gng"],
          [],
          ["newuser"],
        ),
      },
    ]);
  });

  it("全体のngWordsだけのpatchでも全体のリポスト非表示ユーザーIDが空で上書きされない", () => {
    const result = buildGlobalNgScripts({ ngWords: ["new"] }, current, columns);
    expect(result[0].script).toBe(
      WEBVIEW_SCRIPTS.applyNgWords(["colng1"], ["new"], ["col1"], ["guser"]),
    );
  });

  it("全体のIDだけのpatchでも全体のngWordsが空で上書きされない", () => {
    const result = buildGlobalNgScripts(
      { repostHiddenUserIds: [] },
      current,
      columns,
    );
    expect(result[0].script).toBe(
      WEBVIEW_SCRIPTS.applyNgWords(["colng1"], ["gng"], ["col1"], []),
    );
  });

  it("ngWordsとIDの両方を含むpatchは両方の新しい値で反映される", () => {
    const result = buildGlobalNgScripts(
      { ngWords: ["n"], repostHiddenUserIds: ["u"] },
      current,
      columns,
    );
    expect(result[1].script).toBe(
      WEBVIEW_SCRIPTS.applyNgWords(["colng2"], ["n"], [], ["u"]),
    );
  });

  it("どちらも含まないpatchでは何も送らない", () => {
    expect(buildGlobalNgScripts({ theme: "dark" }, current, columns)).toEqual(
      [],
    );
  });

  it("現在の全体設定に値が無い旧データでも空配列として補う", () => {
    const legacy = { ...current } as Partial<typeof current>;
    delete legacy.repostHiddenUserIds;
    const result = buildGlobalNgScripts(
      { ngWords: ["n"] },
      legacy as typeof current,
      columns,
    );
    expect(result[0].script).toBe(
      WEBVIEW_SCRIPTS.applyNgWords(["colng1"], ["n"], ["col1"], []),
    );
  });
});

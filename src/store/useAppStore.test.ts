import { invoke } from "@tauri-apps/api/core";
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Account, Column } from "../types";
import { DEFAULT_GLOBAL_SETTINGS } from "../types";
import { useAppStore, migrateColumn } from "./useAppStore";

// Mock invoke from @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// logError 経由で呼ばれる plugin-log の error が同じ invoke モックを
// 内部で呼び出すため、save_settings 用のモック制御と混ざらないよう分離する
vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
}));

const mockInvoke = vi.mocked(invoke);

const mockAccount: Account = {
  id: "acc-1",
  label: "テストアカウント",
  dataDirectory: "/path/to/data",
  color: "#1d9bf0",
  createdAt: "2026-05-02T00:00:00Z",
};

const mockColumn: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  homeTabName: "フォロー中",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: {
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
  },
};

describe("useAppStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // テストごとに invoke のカスタム実装(mockImplementation等)が残らないようにする
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    // ストアをリセット
    useAppStore.setState({
      accounts: [],
      columns: [],
      globalSettings: {
        theme: "dark",
        customCSS: "",
        windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
        defaultAutoReloadEnabled: true,
        defaultAutoReloadInterval: 60,
        defaultShowCountdown: true,
        defaultHideHeaderEnabled: true,
        defaultHideTweetInputEnabled: true,
        defaultShowCustomMenu: false,
        defaultScrollPosRestoreEnabled: true,
        defaultColumnCustomCSS: "",
        popupEscCloseEnabled: true,
        videoAutoPlayStopEnabled: false,
        imagePopupEnabled: true,
        videoPopupEnabled: true,
        showSortButtons: true,
        smallImageEnabled: false,
        smallImageWidth: "50%",
        blurImageEnabled: false,
        blurImageAmount: "10px",
        hideAdEnabled: false,
        apiRateLimitMonitorEnabled: true,
        columnScale: "default",
        useXAppForCompose: false,
        mobileSwipeAreaEnabled: true,
        mobileSwipeAreaHeight: 28,
        mobileSwipeAreaOpacity: 50,
        mobileTwoColumnEnabled: true,
        presets: [],
        ngWords: [],
        repostHiddenUserIds: [],
        pendingDataDirectoryDeletions: [],
      },
      isLoaded: false,
      isMobile: false,
      unreadCounts: {},
    });
  });

  it("アカウントを追加できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
    });
    expect(result.current.accounts).toContainEqual(mockAccount);
  });

  it("アカウント名を変更できる", async () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.updateAccount("acc-1", { label: "新しい名前" });
    });
    expect(result.current.accounts[0].label).toBe("新しい名前");
    // 保存は直列化されるチェーン経由の非同期実行になるため、実行を待つ
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_settings",
        expect.anything(),
      ),
    );
  });

  it("アカウントの色を変更できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.updateAccount("acc-1", { color: "#e0245e" });
    });
    expect(result.current.accounts[0].color).toBe("#e0245e");
  });

  it("アカウントのxUserIdを変更できる", async () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.updateAccount("acc-1", { xUserId: "1234567890" });
    });
    expect(result.current.accounts[0].xUserId).toBe("1234567890");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_settings",
        expect.anything(),
      ),
    );
  });

  it("アカウントのdataDirectoryを変更できる", async () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.updateAccount("acc-1", { dataDirectory: "/data/new-dir" });
    });
    expect(result.current.accounts[0].dataDirectory).toBe("/data/new-dir");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_settings",
        expect.anything(),
      ),
    );
  });

  it("updateAccountで存在しないIDを指定してもアカウントは変わらない", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.updateAccount("non-existent-id", { label: "無視される" });
    });
    expect(result.current.accounts).toEqual([mockAccount]);
  });

  it("アカウントを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.removeAccount("acc-1");
    });
    expect(result.current.accounts).not.toContainEqual(mockAccount);
  });

  it("カラムを追加できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
    });
    expect(result.current.columns).toContainEqual(mockColumn);
  });

  it("カラムを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.removeColumn("col-1");
    });
    expect(result.current.columns).not.toContainEqual(mockColumn);
  });

  it("指定アカウントのカラムだけを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    const otherAccountColumn: Column = {
      ...mockColumn,
      id: "col-2",
      accountId: "acc-2",
    };
    const externalColumn: Column = {
      ...mockColumn,
      id: "col-external",
      accountId: "col-external",
      pageType: "external",
    };
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.addColumn(otherAccountColumn);
      result.current.addColumn(externalColumn);
      result.current.removeColumnsByAccount("acc-1");
    });
    expect(result.current.columns.map((c) => c.id)).toEqual([
      "col-2",
      "col-external",
    ]);
  });

  it("removeColumnsByAccountで該当カラムが無くても他のカラムはそのまま残る", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.removeColumnsByAccount("acc-missing");
    });
    expect(result.current.columns).toContainEqual(mockColumn);
  });

  it("カラム設定を更新できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.updateColumn("col-1", { width: 400 });
    });
    expect(result.current.columns[0].width).toBe(400);
  });

  it("isMobile のデフォルト値は false", () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.isMobile).toBe(false);
  });

  it("setIsMobile で isMobile を変更できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setIsMobile(true);
    });
    expect(result.current.isMobile).toBe(true);
  });

  it("setUnreadCount でカラムの未読数をセットできる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.setUnreadCount("col-1", 5);
    });
    expect(result.current.unreadCounts["col-1"]).toBe(5);
  });

  it("clearUnreadCount でカラムの未読数を0にリセットできる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.setUnreadCount("col-1", 5);
      result.current.clearUnreadCount("col-1");
    });
    expect(result.current.unreadCounts["col-1"]).toBe(0);
  });

  it("unreadCounts の初期値は空オブジェクト", () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.unreadCounts).toEqual({});
  });

  it("apiRateLimitsの初期値は空オブジェクト", () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.apiRateLimits).toEqual({});
  });

  it("setApiRateLimitを呼ぶと指定したアカウントのバケット情報が更新される", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setApiRateLimit("acc-1", {
        bucketKey: "home_timeline",
        limit: 500,
        remaining: 100,
        reset: 1700000000,
        updatedAt: 1700000000000,
      });
    });
    expect(result.current.apiRateLimits["acc-1"]["home_timeline"]).toEqual({
      bucketKey: "home_timeline",
      limit: 500,
      remaining: 100,
      reset: 1700000000,
      updatedAt: 1700000000000,
    });
  });

  it("同一アカウントの別バケットを追加しても既存バケットは保持される", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setApiRateLimit("acc-1", {
        bucketKey: "home_timeline",
        limit: 500,
        remaining: 100,
        reset: 1700000000,
        updatedAt: 1700000000000,
      });
      result.current.setApiRateLimit("acc-1", {
        bucketKey: "user_tweets",
        limit: 300,
        remaining: 50,
        reset: 1700000100,
        updatedAt: 1700000100000,
      });
    });
    expect(result.current.apiRateLimits["acc-1"]["home_timeline"]).toEqual({
      bucketKey: "home_timeline",
      limit: 500,
      remaining: 100,
      reset: 1700000000,
      updatedAt: 1700000000000,
    });
    expect(result.current.apiRateLimits["acc-1"]["user_tweets"]).toEqual({
      bucketKey: "user_tweets",
      limit: 300,
      remaining: 50,
      reset: 1700000100,
      updatedAt: 1700000100000,
    });
  });

  it("同一バケットに再度setApiRateLimitを呼ぶと値が上書きされる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setApiRateLimit("acc-1", {
        bucketKey: "home_timeline",
        limit: 500,
        remaining: 100,
        reset: 1700000000,
        updatedAt: 1700000000000,
      });
      result.current.setApiRateLimit("acc-1", {
        bucketKey: "home_timeline",
        limit: 500,
        remaining: 80,
        reset: 1700000050,
        updatedAt: 1700000050000,
      });
    });
    expect(result.current.apiRateLimits["acc-1"]["home_timeline"]).toEqual({
      bucketKey: "home_timeline",
      limit: 500,
      remaining: 80,
      reset: 1700000050,
      updatedAt: 1700000050000,
    });
  });

  it("別アカウントのバケットは互いに独立して保持される", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setApiRateLimit("acc-1", {
        bucketKey: "home_timeline",
        limit: 500,
        remaining: 100,
        reset: 1700000000,
        updatedAt: 1700000000000,
      });
      result.current.setApiRateLimit("acc-2", {
        bucketKey: "home_timeline",
        limit: 500,
        remaining: 10,
        reset: 1700000000,
        updatedAt: 1700000000000,
      });
    });
    expect(
      result.current.apiRateLimits["acc-1"]["home_timeline"].remaining,
    ).toBe(100);
    expect(
      result.current.apiRateLimits["acc-2"]["home_timeline"].remaining,
    ).toBe(10);
  });

  it("savePreset で現在のカラムをプリセットとして保存できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.savePreset("マイレイアウト");
    });
    const presets = result.current.globalSettings.presets;
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe("マイレイアウト");
    expect(presets[0].columns).toHaveLength(1);
    expect(presets[0].id).toBeTruthy();
  });

  it("savePreset を複数回呼ぶと複数のプリセットが保存される", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.savePreset("レイアウトA");
      result.current.savePreset("レイアウトB");
    });
    expect(result.current.globalSettings.presets).toHaveLength(2);
  });

  it("loadPreset で指定IDのプリセットのカラムに差し替えられる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.savePreset("テストレイアウト");
      result.current.removeColumn(mockColumn.id);
    });
    const preset = result.current.globalSettings.presets[0];
    expect(result.current.columns).toHaveLength(0);
    act(() => {
      result.current.loadPreset(preset.id);
    });
    expect(result.current.columns).toHaveLength(1);
    expect(result.current.columns[0].id).toBe(mockColumn.id);
  });

  it("loadPreset で存在しないIDを指定してもカラムは変わらない", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.loadPreset("non-existent-id");
    });
    expect(result.current.columns).toHaveLength(1);
  });

  it("deletePreset で指定IDのプリセットを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.savePreset("削除対象");
    });
    const presetId = result.current.globalSettings.presets[0].id;
    act(() => {
      result.current.deletePreset(presetId);
    });
    expect(result.current.globalSettings.presets).toHaveLength(0);
  });

  it("旧バージョンの全体設定はリポスト元ユーザーIDが空として読み込まれる", async () => {
    const { repostHiddenUserIds: _omitted, ...legacyGlobal } =
      DEFAULT_GLOBAL_SETTINGS;
    void _omitted;
    mockInvoke.mockResolvedValueOnce({
      settings: { accounts: [], columns: [], globalSettings: legacyGlobal },
      loadFailed: false,
      backupPath: null,
    });
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await result.current.loadSettings();
    });
    expect(result.current.globalSettings.repostHiddenUserIds).toEqual([]);
  });

  it("保存済みの全体設定のリポスト元ユーザーIDは読み込み時にそのまま保持される", async () => {
    mockInvoke.mockResolvedValueOnce({
      settings: {
        accounts: [],
        columns: [],
        globalSettings: {
          ...DEFAULT_GLOBAL_SETTINGS,
          repostHiddenUserIds: ["alice"],
        },
      },
      loadFailed: false,
      backupPath: null,
    });
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await result.current.loadSettings();
    });
    expect(result.current.globalSettings.repostHiddenUserIds).toEqual([
      "alice",
    ]);
  });

  it("保存が連続したときは要求した順に1件ずつ保存される", async () => {
    const resolvers: Array<() => void> = [];
    mockInvoke.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.addAccount(mockAccount);
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.updateAccount("acc-1", { label: "1回目の変更" });
      result.current.updateAccount("acc-1", { label: "2回目の変更" });
    });
    // 1件目の保存が完了していないので、続く2件はまだ実行されない
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    resolvers[0]();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
    // 2件目が完了するまで3件目は実行されない
    expect(mockInvoke).toHaveBeenCalledTimes(2);

    resolvers[1]();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(3));

    // チェーンを完了させ、後続テストへの影響を残さない
    resolvers[2]();
    await waitFor(() => expect(resolvers).toHaveLength(3));
  });

  it("連続した保存のうち最後に保存されるのは最新の状態である", async () => {
    const resolvers: Array<() => void> = [];
    mockInvoke.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.addAccount(mockAccount);
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.updateAccount("acc-1", { label: "1回目の変更" });
      result.current.updateAccount("acc-1", { label: "2回目の変更" });
    });

    resolvers[0]();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
    resolvers[1]();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(3));
    resolvers[2]();
    await waitFor(() => expect(resolvers).toHaveLength(3));

    const lastCallArgs = mockInvoke.mock.calls[2][1] as {
      settings: { accounts: Account[] };
    };
    expect(lastCallArgs.settings.accounts[0].label).toBe("2回目の変更");
  });

  it("途中の保存に失敗しても後続の保存は行われる", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("保存失敗"));
    mockInvoke.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.addAccount(mockAccount);
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.updateAccount("acc-1", { label: "2回目の変更" });
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
  });

  it("設定を正常に解析できたときは退避も通知も行われない", async () => {
    mockInvoke.mockResolvedValueOnce({
      settings: {
        accounts: [],
        columns: [],
        globalSettings: DEFAULT_GLOBAL_SETTINGS,
      },
      loadFailed: false,
      backupPath: null,
    });
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await result.current.loadSettings();
    });
    expect(result.current.settingsLoadNotice).toBeNull();
  });

  it("設定ファイルが存在しない初回起動では退避も通知も行われない", async () => {
    mockInvoke.mockResolvedValueOnce({
      settings: {
        accounts: [],
        columns: [],
        globalSettings: DEFAULT_GLOBAL_SETTINGS,
      },
      loadFailed: false,
      backupPath: null,
    });
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await result.current.loadSettings();
    });
    expect(result.current.settingsLoadNotice).toBeNull();
  });

  it("設定を解析できないときは読み込み失敗と退避先が通知される", async () => {
    mockInvoke.mockResolvedValueOnce({
      settings: {
        accounts: [],
        columns: [],
        globalSettings: DEFAULT_GLOBAL_SETTINGS,
      },
      loadFailed: true,
      backupPath: "/data/settings.json.20260922-120000.bak",
    });
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await result.current.loadSettings();
    });
    expect(result.current.settingsLoadNotice).toContain(
      "/data/settings.json.20260922-120000.bak",
    );
  });

  it("設定の退避にも失敗したときはその旨が通知される", async () => {
    mockInvoke.mockResolvedValueOnce({
      settings: {
        accounts: [],
        columns: [],
        globalSettings: DEFAULT_GLOBAL_SETTINGS,
      },
      loadFailed: true,
      backupPath: null,
    });
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await result.current.loadSettings();
    });
    expect(result.current.settingsLoadNotice).toContain("バックアップ");
    expect(result.current.settingsLoadNotice).not.toContain("次の場所");
  });

  it("dismissSettingsLoadNoticeを呼ぶと通知が消える", async () => {
    mockInvoke.mockResolvedValueOnce({
      settings: {
        accounts: [],
        columns: [],
        globalSettings: DEFAULT_GLOBAL_SETTINGS,
      },
      loadFailed: true,
      backupPath: "/data/settings.json.20260922-120000.bak",
    });
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await result.current.loadSettings();
    });
    expect(result.current.settingsLoadNotice).not.toBeNull();
    act(() => {
      result.current.dismissSettingsLoadNotice();
    });
    expect(result.current.settingsLoadNotice).toBeNull();
  });

  it("addPendingDataDirectoryDeletionで削除保留フォルダを追加できる", async () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addPendingDataDirectoryDeletion("/data/acc-1");
    });
    expect(result.current.globalSettings.pendingDataDirectoryDeletions).toEqual(
      ["/data/acc-1"],
    );
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_settings",
        expect.anything(),
      ),
    );
  });

  it("addPendingDataDirectoryDeletionは同じパスを重複追加しない", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addPendingDataDirectoryDeletion("/data/acc-1");
      result.current.addPendingDataDirectoryDeletion("/data/acc-1");
    });
    expect(result.current.globalSettings.pendingDataDirectoryDeletions).toEqual(
      ["/data/acc-1"],
    );
  });

  it("setPendingDataDirectoryDeletionsで削除保留フォルダを置き換えられる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addPendingDataDirectoryDeletion("/data/acc-1");
      result.current.addPendingDataDirectoryDeletion("/data/acc-2");
      result.current.setPendingDataDirectoryDeletions(["/data/acc-2"]);
    });
    expect(result.current.globalSettings.pendingDataDirectoryDeletions).toEqual(
      ["/data/acc-2"],
    );
  });

  it("updateGlobalSettingsはpendingDataDirectoryDeletionsを含まないpatchで巻き戻さない（設定パネル保存時の回帰確認）", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addPendingDataDirectoryDeletion("/data/acc-1");
      // AppSettingsPanelの「適用」相当。pendingDataDirectoryDeletionsを含まないpatch
      result.current.updateGlobalSettings({ theme: "light" });
    });
    expect(result.current.globalSettings.pendingDataDirectoryDeletions).toEqual(
      ["/data/acc-1"],
    );
    expect(result.current.globalSettings.theme).toBe("light");
  });
});

describe("migrateColumn", () => {
  it("旧バージョンの保存設定はリポスト元ユーザーIDが空として読み込まれる", () => {
    const { repostHiddenUserIds: _omitted, ...legacySettings } =
      mockColumn.settings;
    void _omitted;
    const legacy = { ...mockColumn, settings: legacySettings };
    const result = migrateColumn(legacy as unknown as Column);
    expect(result.settings.repostHiddenUserIds).toEqual([]);
  });

  it("保存済みのリポスト元ユーザーIDは読み込み時にそのまま保持される", () => {
    const col: Column = {
      ...mockColumn,
      settings: { ...mockColumn.settings, repostHiddenUserIds: ["alice"] },
    };
    expect(migrateColumn(col).settings.repostHiddenUserIds).toEqual(["alice"]);
  });

  it("gridフィールドがない既存カラムにデフォルト値を補完する", () => {
    const legacy = {
      id: "col-1",
      accountId: "acc-1",
      pageType: "home" as const,
      width: 350,
      order: 2,
      settings: {
        autoReloadEnabled: true,
        autoReloadInterval: 60,
        showCountdown: true,
        areaRemoveEnabled: true,
        customCSS: "",
        visibleLinks: [],
        smallImageEnabled: false,
        smallImageWidth: "50%",
      },
    };
    const result = migrateColumn(legacy as unknown as Column);
    expect(result.gridRow).toBe(1);
    expect(result.gridCol).toBe(3); // order + 1
    expect(result.heightMode).toBe("auto");
    expect(result.heightValue).toBeUndefined();
    expect(result.heightUnit).toBeUndefined();
  });

  it("gridフィールドがある新しいカラムはそのまま返す", () => {
    const col: Column = {
      ...mockColumn,
      gridRow: 2,
      gridCol: 3,
      heightMode: "fixed",
      heightValue: 400,
      heightUnit: "px",
    };
    const result = migrateColumn(col);
    expect(result.gridRow).toBe(2);
    expect(result.gridCol).toBe(3);
    expect(result.heightMode).toBe("fixed");
    expect(result.heightValue).toBe(400);
  });

  it("最新タブ指定つきの検索カラムは読み込み時も最新タブ指定を保持する", () => {
    const col: Column = {
      ...mockColumn,
      pageType: "search",
      searchQuery: "rust",
      searchLiveTab: true,
    };
    expect(migrateColumn(col).searchLiveTab).toBe(true);
  });

  it("最新タブ指定のない既存の検索カラムは読み込み時に最新タブ指定が補われない", () => {
    const col: Column = {
      ...mockColumn,
      pageType: "search",
      searchQuery: "rust",
    };
    expect(migrateColumn(col).searchLiveTab).toBeUndefined();
  });
});

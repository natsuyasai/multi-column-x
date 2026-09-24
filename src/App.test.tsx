import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";
import { WEBVIEW_SCRIPTS } from "./constants/ipc";
import { HEADER_HEIGHT, getTopBarHeight } from "./lib/gridLayout";
import { useAppStore } from "./store/useAppStore";
import type { Column, GlobalSettings } from "./types";
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_COLUMN_SETTINGS } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "windows"),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
}));

const mockInvoke = vi.mocked(invoke);
const mockPlatform = vi.mocked(platform);

type MatchMediaListener = (e: { matches: boolean }) => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<MatchMediaListener>();
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: MatchMediaListener) => listeners.add(cb),
    removeEventListener: (_: string, cb: MatchMediaListener) =>
      listeners.delete(cb),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    emit: (next: boolean) => {
      mql.matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

const account = {
  id: "acc-1",
  label: "アカウントA",
  dataDirectory: "/data/acc-1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

const column: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: { ...DEFAULT_COLUMN_SETTINGS },
};

const globalSettings: GlobalSettings = { ...DEFAULT_GLOBAL_SETTINGS };

describe("App (desktop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockPlatform.mockReturnValue("windows");
    useAppStore.setState({
      accounts: [account],
      columns: [],
      globalSettings,
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
      unreadCounts: {},
    });
  });

  it("TopBarの操作ボタンが表示される", () => {
    render(<App />);
    expect(screen.getByTitle("カラムを追加 (Ctrl+N)")).toBeInTheDocument();
    expect(screen.getByTitle("ツイートを作成 (Ctrl+T)")).toBeInTheDocument();
    expect(
      screen.getByTitle("アカウント管理 (Ctrl+Shift+A)"),
    ).toBeInTheDocument();
  });

  it("カラム追加ボタンでAddColumnDialogが開く", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("カラムを追加 (Ctrl+N)"));
    expect(screen.getByText("アカウントA")).toBeInTheDocument();
  });

  it("ダイアログを開くと全カラムWebViewが画面外へ退避される", async () => {
    useAppStore.setState({ columns: [column] });
    render(<App />);
    mockInvoke.mockClear();

    fireEvent.click(screen.getByTitle("カラムを追加 (Ctrl+N)"));

    await waitFor(() => {
      const resizeCalls = mockInvoke.mock.calls.filter(
        (c) => c[0] === "resize_column_webview",
      );
      expect(resizeCalls.length).toBeGreaterThan(0);
      expect((resizeCalls[0][1] as any).bounds).toMatchObject({
        columnId: "col-1",
        x: -9999,
      });
    });
  });

  it("TopBarを展開するとカラムの表示位置が待ち時間なしで展開後のTopBarの直下に移動する", async () => {
    useAppStore.setState({ columns: [column], topBarExpanded: false });
    render(<App />);
    // 起動時のカラム復元（非同期）が完了するのを待ってから、TopBar操作の効果だけを検証する
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_column_webview",
        expect.anything(),
      );
    });
    mockInvoke.mockClear();

    fireEvent.click(screen.getByTitle("ツールバーを展開 (Ctrl+B)"));

    const expectedY = getTopBarHeight(true) + HEADER_HEIGHT;
    await waitFor(
      () => {
        const resizeCalls = mockInvoke.mock.calls.filter(
          (c) => c[0] === "resize_column_webview",
        );
        expect(resizeCalls.length).toBeGreaterThan(0);
        expect((resizeCalls[0][1] as any).bounds).toMatchObject({
          columnId: "col-1",
          y: expectedY,
        });
      },
      { timeout: 100 },
    );
  });

  it("TopBarを折りたたむとカラムの表示位置が待ち時間なしで折りたたみ後のTopBarの直下に移動する", async () => {
    useAppStore.setState({ columns: [column], topBarExpanded: true });
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_column_webview",
        expect.anything(),
      );
    });
    mockInvoke.mockClear();

    fireEvent.click(screen.getByTitle("ツールバーを折りたたむ (Ctrl+B)"));

    const expectedY = getTopBarHeight(false) + HEADER_HEIGHT;
    await waitFor(
      () => {
        const resizeCalls = mockInvoke.mock.calls.filter(
          (c) => c[0] === "resize_column_webview",
        );
        expect(resizeCalls.length).toBeGreaterThan(0);
        expect((resizeCalls[0][1] as any).bounds).toMatchObject({
          columnId: "col-1",
          y: expectedY,
        });
      },
      { timeout: 100 },
    );
  });

  it("キーボードショートカットでTopBarを開閉してもカラムの表示位置が待ち時間なしで追従する", async () => {
    useAppStore.setState({ columns: [column], topBarExpanded: false });
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_column_webview",
        expect.anything(),
      );
    });
    mockInvoke.mockClear();

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    const expectedY = getTopBarHeight(true) + HEADER_HEIGHT;
    await waitFor(
      () => {
        const resizeCalls = mockInvoke.mock.calls.filter(
          (c) => c[0] === "resize_column_webview",
        );
        expect(resizeCalls.length).toBeGreaterThan(0);
        expect((resizeCalls[0][1] as any).bounds).toMatchObject({
          columnId: "col-1",
          y: expectedY,
        });
      },
      { timeout: 100 },
    );
  });

  it("ダイアログ表示中にTopBarを開閉してもカラムは退避したままで閉じると新しい位置に表示される", async () => {
    useAppStore.setState({ columns: [column], topBarExpanded: false });
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_column_webview",
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByTitle("カラムを追加 (Ctrl+N)"));
    await waitFor(() => {
      const resizeCalls = mockInvoke.mock.calls.filter(
        (c) => c[0] === "resize_column_webview",
      );
      expect(resizeCalls.length).toBeGreaterThan(0);
      expect(
        (resizeCalls[resizeCalls.length - 1][1] as any).bounds,
      ).toMatchObject({ columnId: "col-1", x: -9999 });
    });

    mockInvoke.mockClear();
    fireEvent.click(screen.getByTitle("ツールバーを展開 (Ctrl+B)"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    const resizeCallsDuringDialog = mockInvoke.mock.calls.filter(
      (c) => c[0] === "resize_column_webview",
    );
    const expectedExpandedY = getTopBarHeight(true) + HEADER_HEIGHT;
    expect(
      resizeCallsDuringDialog.some(
        (c) => (c[1] as any).bounds?.y === expectedExpandedY,
      ),
    ).toBe(false);

    fireEvent.click(screen.getByText("キャンセル"));

    await waitFor(() => {
      const resizeCalls = mockInvoke.mock.calls.filter(
        (c) => c[0] === "resize_column_webview",
      );
      expect(
        resizeCalls.some((c) => (c[1] as any).bounds?.y === expectedExpandedY),
      ).toBe(true);
    });
  });

  it("アプリ起動時にはTopBar開閉による再配置は行われない", async () => {
    useAppStore.setState({ columns: [column], topBarExpanded: false });
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_column_webview",
        expect.anything(),
      );
    });

    // 観点: 起動時のカラム復元（create_column_webview）より前に発生する
    // resize_column_webviewは、既存のダイアログ復元effect（anyDialogOpen初期値false
    // による1回分）のみであり、TopBar開閉用effectが追加でもう1回発火しないこと。
    // useLayoutEffectはマウント時のDOM反映直後に同期実行されるため、
    // 初回マウントでも実行してしまう実装では、この余分なresize呼び出しが
    // 非同期のcreate_column_webviewより先に発生し、件数が2件に増える。
    const firstCreateIndex = mockInvoke.mock.calls.findIndex(
      (c) => c[0] === "create_column_webview",
    );
    const resizeCallsBeforeCreate = mockInvoke.mock.calls
      .slice(0, firstCreateIndex)
      .filter((c) => c[0] === "resize_column_webview").length;

    expect(resizeCallsBeforeCreate).toBe(1);
  });

  it("ツイート作成ボタンでopen_compose_windowが呼ばれる", async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("ツイートを作成 (Ctrl+T)"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("open_compose_window", {
        accountId: "acc-1",
        dataDirectory: "/data/acc-1",
      });
    });
  });

  it("アカウント管理を開くと各アカウント行に再認証ボタンが表示される", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("アカウント管理 (Ctrl+Shift+A)"));
    expect(screen.getByLabelText("アカウントA を再認証")).toBeInTheDocument();
  });

  it("accountIdに一致するアカウントが見つからない通常カラムは描画されない", () => {
    const orphanColumn: Column = {
      ...column,
      id: "col-orphan",
      accountId: "acc-missing",
    };
    useAppStore.setState({ columns: [orphanColumn] });
    render(<App />);
    expect(screen.queryByText("フォロー中")).not.toBeInTheDocument();
  });

  it("externalカラムはアカウントが見つからなくても描画される", () => {
    const externalColumn: Column = {
      ...column,
      id: "col-external",
      accountId: "acc-missing",
      pageType: "external",
      customUrl: "https://example.com",
    };
    useAppStore.setState({ columns: [externalColumn] });
    render(<App />);
    expect(screen.getByText("外部: example.com")).toBeInTheDocument();
  });

  it("設定読み込み失敗の通知があるとダイアログが表示され、OKを押すと消える", () => {
    useAppStore.setState({
      settingsLoadNotice:
        "設定ファイルを読み込めなかったため、初期設定で起動しました。元の設定は次の場所にバックアップしました: /data/settings.json.20260922-120000.bak",
    });
    render(<App />);
    expect(
      screen.getByText("設定の読み込みに失敗しました"),
    ).toBeInTheDocument();
    expect(screen.getByText(/バックアップしました/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("OK"));

    expect(
      screen.queryByText("設定の読み込みに失敗しました"),
    ).not.toBeInTheDocument();
  });
});

describe("App (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockPlatform.mockReturnValue("android");
    useAppStore.setState({
      accounts: [account],
      columns: [column],
      globalSettings,
      isLoaded: true,
      isMobile: true,
      topBarExpanded: false,
      unreadCounts: {},
    });
  });

  it("モバイルではMobileTabBarが表示されTopBarは表示されない", () => {
    render(<App />);
    expect(screen.getByTitle("ツイートを作成")).toBeInTheDocument();
    expect(
      screen.queryByTitle("カラムを追加 (Ctrl+N)"),
    ).not.toBeInTheDocument();
  });

  it("カラム復元完了後にupdate_mobile_swipe_barがvisible:trueで呼ばれる", async () => {
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_mobile_swipe_bar",
        expect.objectContaining({
          visible: true,
          height: 28,
          opacity: 50,
          darkTheme: true, // DEFAULT_GLOBAL_SETTINGS.theme === "dark"
        }),
      );
    });
  });

  it("mobileSwipeAreaOpacityが0のときupdate_mobile_swipe_barはvisible:falseで呼ばれる（透明タッチ吸収事故防止）", async () => {
    useAppStore.setState({
      accounts: [account],
      columns: [column],
      isMobile: true,
      isLoaded: true,
      globalSettings: {
        ...DEFAULT_GLOBAL_SETTINGS,
        mobileSwipeAreaOpacity: 0,
      },
    });
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_mobile_swipe_bar",
        expect.objectContaining({ visible: false, opacity: 0 }),
      );
    });
  });

  it("画面回転・ウィンドウリサイズ時は100msデバウンス後にupdate_mobile_swipe_barのyが再計算される", async () => {
    // jsdomのデフォルト innerHeight=768 → y = 768 - 56(タブバー) - 28(スワイプ領域) = 684
    vi.useFakeTimers();
    try {
      render(<App />);
      // columnsRestored への反映はタイマーを介さない Promise チェーンのみのため、
      // マイクロタスクを進めるために advanceTimersByTimeAsync(0) を挟む
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_mobile_swipe_bar",
        expect.objectContaining({ visible: true, y: 684 }),
      );
      mockInvoke.mockClear();

      // 回転/リサイズで innerHeight が変わったことをシミュレートする
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 400,
      });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      act(() => {
        vi.advanceTimersByTime(50);
      });
      // 50ms時点ではまだデバウンス中のため再同期されない
      expect(
        mockInvoke.mock.calls.filter((c) => c[0] === "update_mobile_swipe_bar"),
      ).toHaveLength(0);

      act(() => {
        vi.advanceTimersByTime(50);
      });
      // resizeイベントから100ms経過したので、新しい innerHeight を反映した y で再同期される
      // y = 400 - 56 - 28 = 316（古い y=684 のまま据え置かれるバグを検知する）
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_mobile_swipe_bar",
        expect.objectContaining({ visible: true, y: 316 }),
      );
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 768,
      });
      vi.useRealTimers();
    }
  });

  it("ダイアログ表示中はupdate_mobile_swipe_barがvisible:falseで呼ばれる", async () => {
    render(<App />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_mobile_swipe_bar",
        expect.objectContaining({ visible: true }),
      );
    });
    mockInvoke.mockClear();

    fireEvent.click(screen.getByTitle("メニュー表示の切り替え"));
    fireEvent.click(screen.getByTitle("アカウント管理"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "update_mobile_swipe_bar",
        expect.objectContaining({ visible: false }),
      );
    });
  });
});

describe("App (テーマ適用時のnight_mode Cookie反映)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockPlatform.mockReturnValue("windows");
    useAppStore.setState({
      accounts: [account],
      columns: [column],
      globalSettings,
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
      unreadCounts: {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openThemeAndApply = (themeLabel: string) => {
    fireEvent.click(screen.getByTitle("アプリ設定 (Ctrl+,)"));
    const checkbox = screen
      .getByText("テーマを変更する")
      .closest("label")
      ?.querySelector("input");
    if (!checkbox) {
      throw new Error("テーマ変更チェックボックスが見つかりません");
    }
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText(themeLabel));
    fireEvent.click(screen.getByText("適用"));
  };

  const getNightModeCalls = () =>
    mockInvoke.mock.calls.filter(
      (c) =>
        c[0] === "eval_in_webview" &&
        typeof (c[1] as { script?: unknown })?.script === "string" &&
        (c[1] as { script: string }).script.includes("night_mode"),
    );

  it("テーマを「ダーク」にして適用すると、全カラムのnight_modeを2にするスクリプトでevalInColumnが呼ばれる", () => {
    render(<App />);
    mockInvoke.mockClear();

    openThemeAndApply("ダーク");

    const calls = getNightModeCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[0][1] as { script: string }).script).toContain('var n="2"');
  });

  it("テーマを「ライト」にして適用すると、night_modeを0にするスクリプトでevalInColumnが呼ばれる", () => {
    render(<App />);
    mockInvoke.mockClear();

    openThemeAndApply("ライト");

    const calls = getNightModeCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[0][1] as { script: string }).script).toContain('var n="0"');
  });

  it("テーマを「システム」にして適用し、OSがダーク配色の場合はnight_modeが2になる", () => {
    installMatchMedia(true);
    render(<App />);
    mockInvoke.mockClear();

    openThemeAndApply("システム");

    const calls = getNightModeCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[0][1] as { script: string }).script).toContain('var n="2"');
  });

  it("テーマを「システム」にして適用し、OSがライト配色の場合はnight_modeが0になる", () => {
    installMatchMedia(false);
    render(<App />);
    mockInvoke.mockClear();

    openThemeAndApply("システム");

    const calls = getNightModeCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[0][1] as { script: string }).script).toContain('var n="0"');
  });

  it("「テーマを変更する」チェックボックスをONにせず他の設定のみ変更して適用した場合、night_mode関連のスクリプトは呼ばれない", () => {
    render(<App />);
    mockInvoke.mockClear();

    fireEvent.click(screen.getByTitle("アプリ設定 (Ctrl+,)"));
    fireEvent.click(screen.getByText("適用"));

    expect(getNightModeCalls()).toHaveLength(0);
  });
});

describe("App (手動更新のスクロール扱い)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockPlatform.mockReturnValue("windows");
    useAppStore.setState({
      accounts: [account],
      columns: [column],
      globalSettings,
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
      unreadCounts: {},
    });
  });

  const getEvalScripts = () =>
    mockInvoke.mock.calls
      .filter((c) => c[0] === "eval_in_webview")
      .map((c) => (c[1] as { label: string; script: string }).script);

  it("ヘッダーの更新ボタンはスクロール中でも先頭へ戻して更新する", () => {
    render(<App />);
    mockInvoke.mockClear();

    fireEvent.click(screen.getByTitle("更新"));

    expect(getEvalScripts()).toEqual([WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD]);
  });

  it("更新のキー操作はスクロール中でも先頭へ戻して更新する", () => {
    render(<App />);
    mockInvoke.mockClear();

    fireEvent.keyDown(window, { key: "r" });

    expect(getEvalScripts()).toEqual([WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD]);
  });

  it("設定パネルからの更新はスクロール中でも先頭へ戻して更新する", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("設定"));
    mockInvoke.mockClear();

    fireEvent.click(screen.getByText("再読み込み"));

    expect(getEvalScripts()).toEqual([WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD]);
  });
});

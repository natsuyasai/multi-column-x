import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
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

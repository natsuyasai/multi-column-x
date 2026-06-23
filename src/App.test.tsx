import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("mobileSwipeAreaEnabledがtrueのときスワイプ帯が描画される", () => {
    useAppStore.setState({
      accounts: [account],
      columns: [column],
      isMobile: true,
      isLoaded: true,
      globalSettings: {
        ...DEFAULT_GLOBAL_SETTINGS,
        mobileSwipeAreaEnabled: true,
      },
    });
    render(<App />);
    expect(screen.queryByText(/スワイプで切替/)).not.toBeNull();
  });

  it("mobileSwipeAreaEnabledがfalseのときスワイプ帯が描画されない", () => {
    useAppStore.setState({
      accounts: [account],
      columns: [column],
      isMobile: true,
      isLoaded: true,
      globalSettings: {
        ...DEFAULT_GLOBAL_SETTINGS,
        mobileSwipeAreaEnabled: false,
      },
    });
    render(<App />);
    expect(screen.queryByText(/スワイプで切替/)).toBeNull();
  });
});

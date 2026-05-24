import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileTabBar } from "./MobileTabBar";
import type { Column, Account } from "../../types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 600,
  showCountdown: true,
  areaRemoveEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
};

const acc1: Account = {
  id: "acc-1",
  label: "アカウント1",
  dataDirectory: "/data/1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

const col1: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: baseSettings,
};

const col2: Column = {
  id: "col-2",
  accountId: "acc-1",
  pageType: "notifications",
  width: 350,
  order: 1,
  gridRow: 1,
  gridCol: 2,
  heightMode: "auto",
  settings: baseSettings,
};

const defaultProps = {
  accounts: [acc1],
  activeColumnId: "col-1",
  onSelectColumn: vi.fn(),
  onAddColumn: vi.fn(),
  onAccountManager: vi.fn(),
  onAppSettings: vi.fn(),
  onOpenLinkPopup: vi.fn(),
  onComposeTweet: vi.fn(),
  onTabAction: vi.fn(),
};

describe("MobileTabBar", () => {
  it("各列のタブが表示される", () => {
    render(<MobileTabBar {...defaultProps} columns={[col1, col2]} />);
    expect(screen.getByText("ホーム")).toBeInTheDocument();
    expect(screen.getByText("通知")).toBeInTheDocument();
  });

  it("タブをタップすると onSelectColumn が列 ID で呼ばれる", async () => {
    const onSelect = vi.fn();
    render(
      <MobileTabBar
        {...defaultProps}
        columns={[col1, col2]}
        onSelectColumn={onSelect}
      />,
    );
    await userEvent.click(screen.getByText("通知"));
    expect(onSelect).toHaveBeenCalledWith("col-2");
  });

  it("カスタムラベルがある場合は pageType 名の代わりに表示される", () => {
    const colWithLabel: Column = { ...col1, label: "マイホーム" };
    render(<MobileTabBar {...defaultProps} columns={[colWithLabel]} />);
    expect(screen.getByText("マイホーム")).toBeInTheDocument();
    expect(screen.queryByText("ホーム")).not.toBeInTheDocument();
  });

  it("長押しすると onTabAction が列 ID で呼ばれる", () => {
    const onTabAction = vi.fn();
    render(
      <MobileTabBar
        {...defaultProps}
        columns={[col1]}
        onTabAction={onTabAction}
      />,
    );
    fireEvent.contextMenu(screen.getByText("ホーム"));
    expect(onTabAction).toHaveBeenCalledWith("col-1");
  });

  it("長押し時には onSelectColumn が呼ばれない", () => {
    const onSelect = vi.fn();
    const onTabAction = vi.fn();
    render(
      <MobileTabBar
        {...defaultProps}
        columns={[col1]}
        onSelectColumn={onSelect}
        onTabAction={onTabAction}
      />,
    );
    fireEvent.contextMenu(screen.getByText("ホーム"));
    expect(onTabAction).toHaveBeenCalledWith("col-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("homeTabName がある場合はそれを表示する", () => {
    const colWithTabName: Column = { ...col1, homeTabName: "フォロー中" };
    render(<MobileTabBar {...defaultProps} columns={[colWithTabName]} />);
    expect(screen.getByText("フォロー中")).toBeInTheDocument();
    expect(screen.queryByText("ホーム")).not.toBeInTheDocument();
  });

  it("タブに並び替えボタンが存在しない", () => {
    render(<MobileTabBar {...defaultProps} columns={[col1, col2]} />);
    expect(screen.queryByLabelText("左に移動")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("右に移動")).not.toBeInTheDocument();
  });

  it("アカウント管理ボタンをクリックすると onAccountManager が呼ばれる", async () => {
    const onAccountManager = vi.fn();
    render(
      <MobileTabBar
        {...defaultProps}
        columns={[]}
        onAccountManager={onAccountManager}
      />,
    );
    await userEvent.click(screen.getByTitle("メニュー表示の切り替え"));
    await userEvent.click(
      screen.getByRole("button", { name: "アカウント管理" }),
    );
    expect(onAccountManager).toHaveBeenCalled();
  });

  it("カラム追加ボタンをクリックすると onAddColumn が呼ばれる", async () => {
    const onAddColumn = vi.fn();
    render(
      <MobileTabBar {...defaultProps} columns={[]} onAddColumn={onAddColumn} />,
    );
    await userEvent.click(screen.getByTitle("メニュー表示の切り替え"));
    await userEvent.click(screen.getByRole("button", { name: "カラムを追加" }));
    expect(onAddColumn).toHaveBeenCalled();
  });

  describe("アクションボタンの SVG アイコン", () => {
    it("ツイートボタンに pencil SVG が表示される", () => {
      const { container } = render(
        <MobileTabBar {...defaultProps} columns={[]} />,
      );
      expect(
        container
          .querySelector('[title="ツイートを作成"]')
          ?.querySelector('[data-testid="icon-pencil"]'),
      ).toBeInTheDocument();
    });

    it("展開後の URL ポップアップボタンに link SVG が表示される", async () => {
      const { container } = render(
        <MobileTabBar {...defaultProps} columns={[]} />,
      );
      await userEvent.click(screen.getByTitle("メニュー表示の切り替え"));
      expect(
        container
          .querySelector('[title="URLをポップアップで開く"]')
          ?.querySelector('[data-testid="icon-link"]'),
      ).toBeInTheDocument();
    });

    it("展開後の設定ボタンに settings SVG が表示される", async () => {
      const { container } = render(
        <MobileTabBar {...defaultProps} columns={[]} />,
      );
      await userEvent.click(screen.getByTitle("メニュー表示の切り替え"));
      expect(
        container
          .querySelector('[title="アプリ設定"]')
          ?.querySelector('[data-testid="icon-settings"]'),
      ).toBeInTheDocument();
    });

    it("展開後のアカウント管理ボタンに person SVG が表示される", async () => {
      const { container } = render(
        <MobileTabBar {...defaultProps} columns={[]} />,
      );
      await userEvent.click(screen.getByTitle("メニュー表示の切り替え"));
      expect(
        container
          .querySelector('[title="アカウント管理"]')
          ?.querySelector('[data-testid="icon-person"]'),
      ).toBeInTheDocument();
    });

    it("展開後のカラム追加ボタンに plus SVG が表示される", async () => {
      const { container } = render(
        <MobileTabBar {...defaultProps} columns={[]} />,
      );
      await userEvent.click(screen.getByTitle("メニュー表示の切り替え"));
      expect(
        container
          .querySelector('[title="カラムを追加"]')
          ?.querySelector('[data-testid="icon-plus"]'),
      ).toBeInTheDocument();
    });
  });
});

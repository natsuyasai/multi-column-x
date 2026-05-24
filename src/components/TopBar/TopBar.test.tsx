import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar } from "./TopBar";
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
  columns: [col1, col2],
  accounts: [acc1],
  expanded: false,
  onToggleExpand: vi.fn(),
  onAddColumn: vi.fn(),
  onAccountManager: vi.fn(),
  onAppSettings: vi.fn(),
  onComposeTweet: vi.fn(),
  onOpenLinkPopup: vi.fn(),
  onJumpToColumn: vi.fn(),
};

describe("TopBar", () => {
  it("ツイート作成ボタンをクリックすると onComposeTweet が呼ばれる", async () => {
    const onComposeTweet = vi.fn();
    render(<TopBar {...defaultProps} onComposeTweet={onComposeTweet} />);
    await userEvent.click(screen.getByTitle("ツイートを作成"));
    expect(onComposeTweet).toHaveBeenCalled();
  });

  it("カラムジャンプボタンが各カラム分表示され、クリックで onJumpToColumn が呼ばれる", async () => {
    const onJump = vi.fn();
    render(<TopBar {...defaultProps} onJumpToColumn={onJump} />);
    const buttons = screen.getAllByTitle(/.+ - (ホーム|通知)/);
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);
    expect(onJump).toHaveBeenCalledWith("col-2");
  });

  it("URLを開くボタンをクリックすると onOpenLinkPopup が呼ばれる", async () => {
    const onOpen = vi.fn();
    render(<TopBar {...defaultProps} onOpenLinkPopup={onOpen} />);
    await userEvent.click(screen.getByTitle("URLをポップアップで開く"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("カラム追加ボタンをクリックすると onAddColumn が呼ばれる", async () => {
    const onAdd = vi.fn();
    render(<TopBar {...defaultProps} onAddColumn={onAdd} />);
    await userEvent.click(screen.getByTitle("カラムを追加"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("アカウント管理ボタンをクリックすると onAccountManager が呼ばれる", async () => {
    const onAcc = vi.fn();
    render(<TopBar {...defaultProps} onAccountManager={onAcc} />);
    await userEvent.click(screen.getByTitle("アカウント管理"));
    expect(onAcc).toHaveBeenCalled();
  });

  it("設定ボタンをクリックすると onAppSettings が呼ばれる", async () => {
    const onSet = vi.fn();
    render(<TopBar {...defaultProps} onAppSettings={onSet} />);
    await userEvent.click(screen.getByTitle("アプリ設定"));
    expect(onSet).toHaveBeenCalled();
  });

  it("展開トグルをクリックすると onToggleExpand が呼ばれる", async () => {
    const onToggle = vi.fn();
    render(<TopBar {...defaultProps} onToggleExpand={onToggle} />);
    await userEvent.click(screen.getByTitle("ツールバーを展開"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("expanded=true のときカラムリスト行（行2）が表示される", () => {
    const { container, rerender } = render(
      <TopBar {...defaultProps} expanded={false} />,
    );
    const collapsedRow2 = container.querySelector(
      '[data-testid="topbar-row2"]',
    );
    expect(collapsedRow2).toBeNull();
    rerender(<TopBar {...defaultProps} expanded={true} />);
    const expandedRow2 = container.querySelector('[data-testid="topbar-row2"]');
    expect(expandedRow2).not.toBeNull();
  });

  it("expanded=true のとき展開トグルのタイトルが「折りたたむ」になる", () => {
    render(<TopBar {...defaultProps} expanded={true} />);
    expect(screen.getByTitle("ツールバーを折りたたむ")).toBeInTheDocument();
  });

  it("カラムにカスタムラベルがある場合はそれが title 属性に出る", () => {
    const labeled: Column = { ...col1, label: "マイホーム" };
    render(<TopBar {...defaultProps} columns={[labeled]} />);
    expect(screen.getByTitle("マイホーム")).toBeInTheDocument();
  });

  describe("アクションボタンの SVG アイコン", () => {
    it("ツイートボタンに pencil SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="ツイートを作成"]')
          ?.querySelector('[data-testid="icon-pencil"]'),
      ).toBeInTheDocument();
    });

    it("URL ポップアップボタンに link SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="URLをポップアップで開く"]')
          ?.querySelector('[data-testid="icon-link"]'),
      ).toBeInTheDocument();
    });

    it("カラム追加ボタンに plus SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="カラムを追加"]')
          ?.querySelector('[data-testid="icon-plus"]'),
      ).toBeInTheDocument();
    });

    it("アカウント管理ボタンに person SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="アカウント管理"]')
          ?.querySelector('[data-testid="icon-person"]'),
      ).toBeInTheDocument();
    });

    it("アプリ設定ボタンに settings SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="アプリ設定"]')
          ?.querySelector('[data-testid="icon-settings"]'),
      ).toBeInTheDocument();
    });
  });

  describe("カラム種別アイコン（collapsed）", () => {
    it.each(["home", "notifications", "search", "list", "custom"] as const)(
      "pageType=%s のとき collapsed ボタン内に SVG アイコンが表示される",
      (pageType) => {
        const col: Column = { ...col1, pageType };
        const { container } = render(
          <TopBar {...defaultProps} columns={[col]} expanded={false} />,
        );
        expect(
          container.querySelector(`[data-testid="icon-${pageType}"]`),
        ).toBeInTheDocument();
      },
    );
  });

  describe("カラム種別アイコン（expanded）", () => {
    it.each(["home", "notifications", "search", "list", "custom"] as const)(
      "pageType=%s のとき expanded 行2内に SVG アイコンが表示される",
      (pageType) => {
        const col: Column = { ...col1, pageType };
        render(<TopBar {...defaultProps} columns={[col]} expanded={true} />);
        const row2 = screen.getByTestId("topbar-row2");
        expect(
          row2.querySelector(`[data-testid="icon-${pageType}"]`),
        ).toBeInTheDocument();
      },
    );
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Column, Account } from "../../types";
import { TopBar } from "./TopBar";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 600,
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
  whitelistEnabled: false,
  whitelistWords: [],
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
  onClose: vi.fn(),
  apiRateLimitMonitorEnabled: true,
  apiRateLimits: {},
  onApiRateLimitPopoverOpenChange: vi.fn(),
};

describe("TopBar", () => {
  it("ツイート作成ボタンをクリックすると onComposeTweet が呼ばれる", async () => {
    const onComposeTweet = vi.fn();
    render(<TopBar {...defaultProps} onComposeTweet={onComposeTweet} />);
    await userEvent.click(screen.getByTitle("ツイートを作成 (Ctrl+T)"));
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
    await userEvent.click(
      screen.getByTitle("URLをポップアップで開く (Ctrl+L)"),
    );
    expect(onOpen).toHaveBeenCalled();
  });

  it("カラム追加ボタンをクリックすると onAddColumn が呼ばれる", async () => {
    const onAdd = vi.fn();
    render(<TopBar {...defaultProps} onAddColumn={onAdd} />);
    await userEvent.click(screen.getByTitle("カラムを追加 (Ctrl+N)"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("アカウント管理ボタンをクリックすると onAccountManager が呼ばれる", async () => {
    const onAcc = vi.fn();
    render(<TopBar {...defaultProps} onAccountManager={onAcc} />);
    await userEvent.click(screen.getByTitle("アカウント管理 (Ctrl+Shift+A)"));
    expect(onAcc).toHaveBeenCalled();
  });

  it("設定ボタンをクリックすると onAppSettings が呼ばれる", async () => {
    const onSet = vi.fn();
    render(<TopBar {...defaultProps} onAppSettings={onSet} />);
    await userEvent.click(screen.getByTitle("アプリ設定 (Ctrl+,)"));
    expect(onSet).toHaveBeenCalled();
  });

  it("展開トグルをクリックすると onToggleExpand が呼ばれる", async () => {
    const onToggle = vi.fn();
    render(<TopBar {...defaultProps} onToggleExpand={onToggle} />);
    await userEvent.click(screen.getByTitle("ツールバーを展開 (Ctrl+B)"));
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
    expect(
      screen.getByTitle("ツールバーを折りたたむ (Ctrl+B)"),
    ).toBeInTheDocument();
  });

  it("カラムにカスタムラベルがある場合はそれが title 属性に出る", () => {
    const labeled: Column = { ...col1, label: "マイホーム" };
    render(<TopBar {...defaultProps} columns={[labeled]} />);
    expect(screen.getByTitle("マイホーム (Ctrl+1)")).toBeInTheDocument();
  });

  it("apiRateLimitMonitorEnabledがtrueのときAPIレート制限インジケータが表示される", () => {
    render(<TopBar {...defaultProps} apiRateLimitMonitorEnabled={true} />);
    expect(screen.getByLabelText("APIレート制限")).toBeInTheDocument();
  });

  it("apiRateLimitMonitorEnabledがfalseのときAPIレート制限インジケータが表示されない", () => {
    render(<TopBar {...defaultProps} apiRateLimitMonitorEnabled={false} />);
    expect(screen.queryByLabelText("APIレート制限")).not.toBeInTheDocument();
  });

  it("APIレート制限インジケータの開閉状態が変化するとonApiRateLimitPopoverOpenChangeが呼ばれる", async () => {
    const onApiRateLimitPopoverOpenChange = vi.fn();
    render(
      <TopBar
        {...defaultProps}
        onApiRateLimitPopoverOpenChange={onApiRateLimitPopoverOpenChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("APIレート制限"));
    expect(onApiRateLimitPopoverOpenChange).toHaveBeenCalledWith(true);
  });

  it("expanded=true のとき各カラムにカラムを閉じるボタンが表示される", () => {
    const { container } = render(<TopBar {...defaultProps} expanded={true} />);
    expect(
      container
        .querySelector('[title="カラムを閉じる"]')
        ?.querySelector('[data-testid="icon-close"]'),
    ).toBeInTheDocument();
  });

  describe("アクションボタンの SVG アイコン", () => {
    it("ツイートボタンに pencil SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="ツイートを作成 (Ctrl+T)"]')
          ?.querySelector('[data-testid="icon-pencil"]'),
      ).toBeInTheDocument();
    });

    it("URL ポップアップボタンに link SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="URLをポップアップで開く (Ctrl+L)"]')
          ?.querySelector('[data-testid="icon-link"]'),
      ).toBeInTheDocument();
    });

    it("カラム追加ボタンに plus SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="カラムを追加 (Ctrl+N)"]')
          ?.querySelector('[data-testid="icon-plus"]'),
      ).toBeInTheDocument();
    });

    it("アカウント管理ボタンに person SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="アカウント管理 (Ctrl+Shift+A)"]')
          ?.querySelector('[data-testid="icon-person"]'),
      ).toBeInTheDocument();
    });

    it("アプリ設定ボタンに settings SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="アプリ設定 (Ctrl+,)"]')
          ?.querySelector('[data-testid="icon-settings"]'),
      ).toBeInTheDocument();
    });
  });

  describe("pageTypeがexternalのときのラベル", () => {
    it("customUrlがある場合はホスト名を含むラベルがtitleに出る", () => {
      const externalCol: Column = {
        ...col1,
        pageType: "external",
        customUrl: "https://example.com/path",
      };
      render(<TopBar {...defaultProps} columns={[externalCol]} />);
      expect(
        screen.getByTitle("アカウント1 - 外部: example.com (Ctrl+1)"),
      ).toBeInTheDocument();
    });

    it("customUrlがない場合は外部サイトがtitleに出る", () => {
      const externalCol: Column = {
        ...col1,
        pageType: "external",
      };
      render(<TopBar {...defaultProps} columns={[externalCol]} />);
      expect(
        screen.getByTitle("アカウント1 - 外部サイト (Ctrl+1)"),
      ).toBeInTheDocument();
    });

    it("customUrlが不正な形式の場合は外部サイトがtitleに出る", () => {
      const externalCol: Column = {
        ...col1,
        pageType: "external",
        customUrl: "not-a-url",
      };
      render(<TopBar {...defaultProps} columns={[externalCol]} />);
      expect(
        screen.getByTitle("アカウント1 - 外部サイト (Ctrl+1)"),
      ).toBeInTheDocument();
    });
  });

  describe("カラム種別アイコン（collapsed）", () => {
    it.each([
      "home",
      "notifications",
      "search",
      "list",
      "custom",
      "external",
      "compose",
    ] as const)(
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
    it.each([
      "home",
      "notifications",
      "search",
      "list",
      "custom",
      "external",
      "compose",
    ] as const)(
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

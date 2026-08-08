import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Column, Account } from "../../types";
import { ColumnHeader } from "./ColumnHeader";
import styles from "./ColumnHeader.module.scss";

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
    whitelistEnabled: false,
    whitelistWords: [],
  },
};

const defaultProps = {
  column: mockColumn,
  account: mockAccount,
  onReload: vi.fn(),
  onReloadPage: vi.fn(),
  onSettings: vi.fn(),
  onClose: vi.fn(),
  onScrollTop: vi.fn(),
};

describe("ColumnHeader", () => {
  it("アカウント名を表示する", () => {
    render(<ColumnHeader {...defaultProps} />);
    expect(
      screen.getByText("テストアカウント - フォロー中"),
    ).toBeInTheDocument();
  });

  it("閉じるボタンクリックでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<ColumnHeader {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("カラムを閉じる"));
    expect(onClose).toHaveBeenCalledWith("col-1");
  });

  it("更新ボタンクリックでonReloadが呼ばれる", () => {
    const onReload = vi.fn();
    render(<ColumnHeader {...defaultProps} onReload={onReload} />);
    fireEvent.click(screen.getByLabelText("更新"));
    expect(onReload).toHaveBeenCalledWith("col-1");
  });

  it("ページ再読み込みボタンクリックでonReloadPageが呼ばれる", () => {
    const onReloadPage = vi.fn();
    render(<ColumnHeader {...defaultProps} onReloadPage={onReloadPage} />);
    fireEvent.click(screen.getByLabelText("ページを再読み込み"));
    expect(onReloadPage).toHaveBeenCalledWith("col-1");
  });

  it("ページ再読み込みボタンは更新ボタンとは別に存在する", () => {
    render(<ColumnHeader {...defaultProps} />);
    expect(screen.getByLabelText("更新")).toBeInTheDocument();
    expect(screen.getByLabelText("ページを再読み込み")).toBeInTheDocument();
  });

  it("並び替えボタンが存在しない", () => {
    render(<ColumnHeader {...defaultProps} />);
    expect(screen.queryByLabelText("左に移動")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("右に移動")).not.toBeInTheDocument();
  });

  it("設定ボタンに settings SVG が表示される", () => {
    const { container } = render(<ColumnHeader {...defaultProps} />);
    expect(
      container
        .querySelector('[title="設定"]')
        ?.querySelector('[data-testid="icon-settings"]'),
    ).toBeInTheDocument();
  });

  it("閉じるボタンに close SVG が表示される", () => {
    const { container } = render(<ColumnHeader {...defaultProps} />);
    expect(
      container
        .querySelector('[title="カラムを閉じる"]')
        ?.querySelector('[data-testid="icon-close"]'),
    ).toBeInTheDocument();
  });

  it("unreadCount が 0 のとき未読バッジは表示されない", () => {
    render(<ColumnHeader {...defaultProps} unreadCount={0} />);
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("unreadCount が 1 以上のとき未読バッジが表示される", () => {
    render(<ColumnHeader {...defaultProps} unreadCount={5} />);
    expect(screen.getByTestId("unread-badge")).toBeInTheDocument();
    // バッジはドット表示のため、テキストは数字ではなく空
    expect(screen.getByTestId("unread-badge").textContent).toBe("");
  });

  it("未読バッジに未読ありを示す aria-label が付与される", () => {
    render(<ColumnHeader {...defaultProps} unreadCount={1} />);
    const badge = screen.getByTestId("unread-badge");
    expect(badge).toHaveAttribute("aria-label", "未読あり");
  });

  it("バッジをクリックすると onClearUnread が呼ばれる", async () => {
    const onClearUnread = vi.fn();
    render(
      <ColumnHeader
        {...defaultProps}
        unreadCount={3}
        onClearUnread={onClearUnread}
      />,
    );
    await userEvent.click(screen.getByTestId("unread-badge"));
    expect(onClearUnread).toHaveBeenCalledWith("col-1");
  });

  it("先頭までスクロールボタンクリックで onScrollTop が呼ばれる", () => {
    const onScrollTop = vi.fn();
    render(<ColumnHeader {...defaultProps} onScrollTop={onScrollTop} />);
    fireEvent.click(screen.getByLabelText("先頭までスクロール"));
    expect(onScrollTop).toHaveBeenCalledWith("col-1");
  });

  it("先頭までスクロールボタンに chevrons-up SVG が表示される", () => {
    const { container } = render(<ColumnHeader {...defaultProps} />);
    expect(
      container
        .querySelector('[title="先頭までスクロール"]')
        ?.querySelector('[data-testid="icon-chevrons-up"]'),
    ).toBeInTheDocument();
  });

  it("accountがundefinedの場合ラベルがページタイプのみになる", () => {
    render(<ColumnHeader {...defaultProps} account={undefined} />);
    expect(screen.getByText("フォロー中")).toBeInTheDocument();
    expect(
      screen.queryByText("テストアカウント - フォロー中"),
    ).not.toBeInTheDocument();
  });

  it("accountがundefinedの場合ドット色がフォールバック値になる", () => {
    const { container } = render(
      <ColumnHeader {...defaultProps} account={undefined} />,
    );
    const header = container.querySelector(`.${styles.header}`);
    const dot = container.querySelector(`.${styles.dot}`);
    expect(header).toHaveStyle({ borderTopColor: "#888" });
    expect(dot).toHaveStyle({ backgroundColor: "#888" });
  });

  describe("pageTypeがexternalの場合", () => {
    const externalColumn: Column = { ...mockColumn, pageType: "external" };

    it("unreadCountが1以上でも未読バッジが表示されない", () => {
      render(
        <ColumnHeader
          {...defaultProps}
          column={externalColumn}
          unreadCount={5}
        />,
      );
      expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
    });

    it("自動更新のカウントダウンが表示されない", () => {
      render(<ColumnHeader {...defaultProps} column={externalColumn} />);
      expect(screen.queryByTitle("次の自動更新まで")).not.toBeInTheDocument();
    });

    it("先頭までスクロールボタンが表示されない", () => {
      render(<ColumnHeader {...defaultProps} column={externalColumn} />);
      expect(
        screen.queryByLabelText("先頭までスクロール"),
      ).not.toBeInTheDocument();
    });

    it("更新ボタンが表示されない", () => {
      render(<ColumnHeader {...defaultProps} column={externalColumn} />);
      expect(screen.queryByLabelText("更新")).not.toBeInTheDocument();
    });

    it("ページ再読み込みボタンは表示される", () => {
      render(<ColumnHeader {...defaultProps} column={externalColumn} />);
      expect(screen.getByLabelText("ページを再読み込み")).toBeInTheDocument();
    });

    it("設定ボタンと閉じるボタンは表示される", () => {
      render(<ColumnHeader {...defaultProps} column={externalColumn} />);
      expect(screen.getByLabelText("設定")).toBeInTheDocument();
      expect(screen.getByLabelText("カラムを閉じる")).toBeInTheDocument();
    });
  });
});

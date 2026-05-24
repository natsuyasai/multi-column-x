import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnHeader } from "./ColumnHeader";
import type { Column, Account } from "../../types";

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
    areaRemoveEnabled: true,
    showCustomMenu: false,
    scrollPosRestoreEnabled: true,
    customCSS: "",
    visibleLinks: [],
    smallImageEnabled: false,
    smallImageWidth: "50%",
    blurImageEnabled: false,
    blurImageAmount: "10px",
  },
};

const defaultProps = {
  column: mockColumn,
  account: mockAccount,
  onReload: vi.fn(),
  onSettings: vi.fn(),
  onClose: vi.fn(),
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
    expect(screen.getByTestId("unread-badge").textContent).toBe("5");
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
});

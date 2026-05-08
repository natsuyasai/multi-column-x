import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    customCSS: "",
    visibleLinks: [],
  },
};

const defaultProps = {
  column: mockColumn,
  account: mockAccount,
  onReload: vi.fn(),
  onMoveLeft: vi.fn(),
  onMoveRight: vi.fn(),
  onSettings: vi.fn(),
  onClose: vi.fn(),
  isFirst: false,
  isLast: false,
  showSortButtons: true,
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

  it("左移動ボタンクリックでonMoveLeftが呼ばれる", () => {
    const onMoveLeft = vi.fn();
    render(<ColumnHeader {...defaultProps} onMoveLeft={onMoveLeft} />);
    fireEvent.click(screen.getByLabelText("左に移動"));
    expect(onMoveLeft).toHaveBeenCalledWith("col-1");
  });

  it("右移動ボタンクリックでonMoveRightが呼ばれる", () => {
    const onMoveRight = vi.fn();
    render(<ColumnHeader {...defaultProps} onMoveRight={onMoveRight} />);
    fireEvent.click(screen.getByLabelText("右に移動"));
    expect(onMoveRight).toHaveBeenCalledWith("col-1");
  });

  it("isFirst=true のとき左移動ボタンが disabled", () => {
    render(<ColumnHeader {...defaultProps} isFirst={true} />);
    expect(screen.getByLabelText("左に移動")).toBeDisabled();
  });

  it("isLast=true のとき右移動ボタンが disabled", () => {
    render(<ColumnHeader {...defaultProps} isLast={true} />);
    expect(screen.getByLabelText("右に移動")).toBeDisabled();
  });

  it("showSortButtons=false のとき左右移動ボタンが非表示になる", () => {
    render(<ColumnHeader {...defaultProps} showSortButtons={false} />);
    expect(screen.queryByLabelText("左に移動")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("右に移動")).not.toBeInTheDocument();
  });

  it("showSortButtons=true のとき左右移動ボタンが表示される", () => {
    render(<ColumnHeader {...defaultProps} showSortButtons={true} />);
    expect(screen.getByLabelText("左に移動")).toBeInTheDocument();
    expect(screen.getByLabelText("右に移動")).toBeInTheDocument();
  });
});

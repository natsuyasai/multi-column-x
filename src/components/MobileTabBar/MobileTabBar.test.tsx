import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileTabBar } from "./MobileTabBar";
import type { Column, Account } from "../../types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 600,
  showCountdown: true,
  areaRemoveEnabled: true,
  showCustomMenu: false,
  customCSS: "",
  visibleLinks: [],
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
  onOpenSettings: vi.fn(),
  onAddColumn: vi.fn(),
  onAccountManager: vi.fn(),
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

  it("設定ボタンをクリックすると onOpenSettings が列 ID で呼ばれる", async () => {
    const onSettings = vi.fn();
    render(
      <MobileTabBar
        {...defaultProps}
        columns={[col1]}
        onOpenSettings={onSettings}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /設定$/ }));
    expect(onSettings).toHaveBeenCalledWith("col-1");
  });

  it("設定ボタンのクリックでは onSelectColumn が呼ばれない", async () => {
    const onSelect = vi.fn();
    const onSettings = vi.fn();
    render(
      <MobileTabBar
        {...defaultProps}
        columns={[col1]}
        onSelectColumn={onSelect}
        onOpenSettings={onSettings}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /設定$/ }));
    expect(onSettings).toHaveBeenCalledWith("col-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("homeTabName がある場合はそれを表示する", () => {
    const colWithTabName: Column = { ...col1, homeTabName: "フォロー中" };
    render(<MobileTabBar {...defaultProps} columns={[colWithTabName]} />);
    expect(screen.getByText("フォロー中")).toBeInTheDocument();
    expect(screen.queryByText("ホーム")).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "カラムを追加" }));
    expect(onAddColumn).toHaveBeenCalled();
  });
});

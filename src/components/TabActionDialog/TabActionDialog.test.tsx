import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabActionDialog } from "./TabActionDialog";

const defaultProps = {
  columnLabel: "テストカラム",
  onSettings: vi.fn(),
  onRemove: vi.fn(),
  onClose: vi.fn(),
};

describe("TabActionDialog", () => {
  it("カラムラベルが表示される", () => {
    render(<TabActionDialog {...defaultProps} />);
    expect(screen.getByText("テストカラム")).toBeInTheDocument();
  });

  it("設定ボタンをクリックすると onSettings が呼ばれる", () => {
    const onSettings = vi.fn();
    render(<TabActionDialog {...defaultProps} onSettings={onSettings} />);
    fireEvent.click(screen.getByText(/設定/));
    expect(onSettings).toHaveBeenCalled();
  });

  it("削除ボタンをクリックすると onRemove が呼ばれる", () => {
    const onRemove = vi.fn();
    render(<TabActionDialog {...defaultProps} onRemove={onRemove} />);
    fireEvent.click(screen.getByText(/削除/));
    expect(onRemove).toHaveBeenCalled();
  });

  it("設定ボタンに settings SVG が表示される", () => {
    render(<TabActionDialog {...defaultProps} />);
    const settingsBtn = screen.getByText(/設定/).closest("button");
    expect(
      settingsBtn?.querySelector('[data-testid="icon-settings"]'),
    ).toBeInTheDocument();
  });

  it("削除ボタンに close SVG が表示される", () => {
    render(<TabActionDialog {...defaultProps} />);
    const removeBtn = screen.getByText(/削除/).closest("button");
    expect(
      removeBtn?.querySelector('[data-testid="icon-close"]'),
    ).toBeInTheDocument();
  });

  it("シートに role=dialog が設定されている", () => {
    render(<TabActionDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Escape キーで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<TabActionDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("背景クリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    const { container } = render(
      <TabActionDialog {...defaultProps} onClose={onClose} />,
    );
    const overlay = container.firstElementChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("シートクリックでは onClose が呼ばれない", () => {
    const onClose = vi.fn();
    render(<TabActionDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

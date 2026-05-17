import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});

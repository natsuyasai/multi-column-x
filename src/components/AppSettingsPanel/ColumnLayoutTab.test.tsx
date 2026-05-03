import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import type { Column } from "../../types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  areaRemoveEnabled: true,
  customCSS: "",
  visibleLinks: [],
};

const mockColumns: Column[] = [
  {
    id: "c1", accountId: "acc-1", pageType: "home",
    width: 350, order: 0, gridRow: 1, gridCol: 1, heightMode: "auto",
    settings: baseSettings,
  },
  {
    id: "c2", accountId: "acc-1", pageType: "notifications",
    width: 350, order: 1, gridRow: 1, gridCol: 2, heightMode: "auto",
    settings: baseSettings,
  },
];

describe("ColumnLayoutTab", () => {
  it("グリッドプレビューにカラムが表示される", () => {
    render(<ColumnLayoutTab columns={mockColumns} onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("notifications")).toBeInTheDocument();
  });

  it("セルをクリックして高さ設定が表示される", () => {
    render(<ColumnLayoutTab columns={mockColumns} onApply={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("home"));
    expect(screen.getByText(/高さ設定/)).toBeInTheDocument();
  });

  it("適用ボタンでonApplyが呼ばれる", () => {
    const onApply = vi.fn();
    render(<ColumnLayoutTab columns={mockColumns} onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("適用"));
    expect(onApply).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "c1" }),
    ]));
  });

  it("×ボタンで割り当てを解除すると未割当リストに移動する", () => {
    render(<ColumnLayoutTab columns={mockColumns} onApply={vi.fn()} onCancel={vi.fn()} />);
    const removeButtons = screen.getAllByLabelText("割り当て解除");
    fireEvent.click(removeButtons[0]);
    expect(screen.getByText("未割当")).toBeInTheDocument();
  });
});

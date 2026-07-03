import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";

describe("ShortcutHelpDialog", () => {
  it("ショートカット一覧が表示される", () => {
    render(<ShortcutHelpDialog onClose={vi.fn()} />);
    expect(screen.getByText("キーボードショートカット")).toBeInTheDocument();
    expect(screen.getByText("ツイートを作成")).toBeInTheDocument();
    expect(screen.getByText("フォーカスカラムを更新")).toBeInTheDocument();
    expect(screen.getByText("このヘルプを表示")).toBeInTheDocument();
  });

  it("閉じるボタンでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<ShortcutHelpDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("EscapeでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<ShortcutHelpDialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

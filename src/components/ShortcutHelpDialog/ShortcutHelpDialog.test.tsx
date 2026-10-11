import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";
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

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("表示言語が英語のときショートカット一覧に日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const { container } = render(<ShortcutHelpDialog onClose={vi.fn()} />);
      expectNoJapanese(container);
      expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
      expect(screen.getByText("Compose a post")).toBeInTheDocument();
      expect(screen.getByText("Reload the focused column")).toBeInTheDocument();
      expect(screen.getByText("Ctrl+T")).toBeInTheDocument();
      expect(screen.getByText("Close")).toBeInTheDocument();
    });

    it("ショートカット一覧を開いたまま表示言語を切り替えると開いている画面の文言も切り替わる", async () => {
      render(<ShortcutHelpDialog onClose={vi.fn()} />);
      expect(screen.getByText("ツイートを作成")).toBeInTheDocument();

      await act(async () => {
        await i18n.changeLanguage("en");
      });

      expect(screen.getByText("Compose a post")).toBeInTheDocument();
      expect(screen.queryByText("ツイートを作成")).not.toBeInTheDocument();
      expect(screen.getByText("Ctrl+T")).toBeInTheDocument();
    });
  });
});

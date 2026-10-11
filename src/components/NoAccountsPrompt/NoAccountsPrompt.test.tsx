import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";
import { NoAccountsPrompt } from "./NoAccountsPrompt";

describe("NoAccountsPrompt", () => {
  it("アカウント追加を促す文言が表示される", () => {
    render(<NoAccountsPrompt onOpenAccountManager={vi.fn()} />);
    expect(
      screen.getByText("先にアカウントを追加してください"),
    ).toBeInTheDocument();
  });

  it("アカウント管理を開くボタンで onOpenAccountManager が呼ばれる", () => {
    const onOpenAccountManager = vi.fn();
    render(<NoAccountsPrompt onOpenAccountManager={onOpenAccountManager} />);
    fireEvent.click(screen.getByText("アカウント管理を開く"));
    expect(onOpenAccountManager).toHaveBeenCalledTimes(1);
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("表示言語が英語のときアカウント未登録の案内に日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const { container } = render(
        <NoAccountsPrompt onOpenAccountManager={vi.fn()} />,
      );
      expectNoJapanese(container);
      expect(screen.getByText("Add an account first")).toBeInTheDocument();
      expect(screen.getByText("Open account manager")).toBeInTheDocument();
    });
  });
});

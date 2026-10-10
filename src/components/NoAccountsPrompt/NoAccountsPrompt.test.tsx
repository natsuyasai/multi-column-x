import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
});

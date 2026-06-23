import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Account } from "../../types";
import { LinkPopupDialog } from "./LinkPopupDialog";

const mockAccounts: Account[] = [
  {
    id: "acc-1",
    label: "アカウントA",
    dataDirectory: "/data/a",
    color: "#1d9bf0",
    createdAt: "2026-05-02T00:00:00Z",
  },
  {
    id: "acc-2",
    label: "アカウントB",
    dataDirectory: "/data/b",
    color: "#e5c07b",
    createdAt: "2026-05-03T00:00:00Z",
  },
];

describe("LinkPopupDialog", () => {
  it("アカウント選択肢がpropsのaccountsから描画される", () => {
    render(
      <LinkPopupDialog
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("option", { name: "アカウントA" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "アカウントB" }),
    ).toBeInTheDocument();
  });

  it("アカウントが1つの場合は選択UIを表示しない", () => {
    render(
      <LinkPopupDialog
        accounts={[mockAccounts[0]]}
        defaultAccountId="acc-1"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("URL入力後に開くボタンでonSubmit(url, accountId)が呼ばれる", () => {
    const onSubmit = vi.fn();
    render(
      <LinkPopupDialog
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("https://x.com/..."), {
      target: { value: "https://x.com/home" },
    });
    fireEvent.click(screen.getByRole("button", { name: "開く" }));

    expect(onSubmit).toHaveBeenCalledWith("https://x.com/home", "acc-1");
  });

  it("アカウントを切り替えてからonSubmitすると選択したaccountIdが渡される", () => {
    const onSubmit = vi.fn();
    render(
      <LinkPopupDialog
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "acc-2" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://x.com/..."), {
      target: { value: "https://x.com/home" },
    });
    fireEvent.click(screen.getByRole("button", { name: "開く" }));

    expect(onSubmit).toHaveBeenCalledWith("https://x.com/home", "acc-2");
  });

  it("EnterキーでonSubmitが呼ばれる", () => {
    const onSubmit = vi.fn();
    render(
      <LinkPopupDialog
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("https://x.com/...");
    fireEvent.change(input, { target: { value: "https://x.com/home" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("https://x.com/home", "acc-1");
  });

  it("キャンセルボタンでonCloseが呼ばれonSubmitは呼ばれない", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <LinkPopupDialog
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("EscキーでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <LinkPopupDialog
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText("https://x.com/..."), {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalled();
  });
});

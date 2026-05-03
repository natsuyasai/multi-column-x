import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountManager } from "./AccountManager";
import type { Account } from "../../types";

const mockAccounts: Account[] = [
  {
    id: "acc-1",
    label: "アカウントA",
    dataDirectory: "/data/a",
    color: "#1d9bf0",
    createdAt: "2026-05-02T00:00:00Z",
  },
];

describe("AccountManager", () => {
  it("アカウント一覧が表示される", () => {
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("アカウントA")).toBeInTheDocument();
  });

  it("削除ボタンでonRemoveAccountが呼ばれる", () => {
    const onRemoveAccount = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={onRemoveAccount}
        onSetDefault={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("アカウントA を削除"));
    expect(onRemoveAccount).toHaveBeenCalledWith("acc-1");
  });
});

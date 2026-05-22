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

  it("デフォルトアカウントのスターボタンに star SVG が表示される", () => {
    const { container } = render(
      <AccountManager
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      container.querySelector('[data-testid="icon-star"]'),
    ).toBeInTheDocument();
  });

  it("非デフォルトアカウントのスターボタンに star-outline SVG が表示される", () => {
    const otherAccount: Account = {
      id: "acc-2",
      label: "アカウントB",
      dataDirectory: "/data/b",
      color: "#e0245e",
      createdAt: "2026-05-02T00:00:00Z",
    };
    const { container } = render(
      <AccountManager
        accounts={[mockAccounts[0], otherAccount]}
        defaultAccountId="acc-1"
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      container.querySelector('[data-testid="icon-star-outline"]'),
    ).toBeInTheDocument();
  });

  it("パネル閉じるボタンに close SVG が表示される", () => {
    const { container } = render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      container
        .querySelector('[aria-label="閉じる"]')
        ?.querySelector('[data-testid="icon-close"]'),
    ).toBeInTheDocument();
  });
});

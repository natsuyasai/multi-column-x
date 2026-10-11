import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";
import type { Account } from "../../types";
import { AccountManager } from "./AccountManager";

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
        onUpdateAccount={vi.fn()}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
      />,
    );
    expect(screen.getByText("アカウントA")).toBeInTheDocument();
  });

  it("名前を編集して保存できる", () => {
    const onUpdateAccount = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onUpdateAccount={onUpdateAccount}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("アカウントA を編集"));
    const input = screen.getByLabelText("アカウント名");
    fireEvent.change(input, { target: { value: "推し垢" } });
    fireEvent.click(screen.getByText("保存"));
    expect(onUpdateAccount).toHaveBeenCalledWith("acc-1", { label: "推し垢" });
  });

  it("編集をキャンセルすると変更が破棄される", () => {
    const onUpdateAccount = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onUpdateAccount={onUpdateAccount}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("アカウントA を編集"));
    const input = screen.getByLabelText("アカウント名");
    fireEvent.change(input, { target: { value: "変更中" } });
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onUpdateAccount).not.toHaveBeenCalled();
    expect(screen.getByText("アカウントA")).toBeInTheDocument();
  });

  it("色を変更できる", () => {
    const onUpdateAccount = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onUpdateAccount={onUpdateAccount}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("アカウントA を編集"));
    fireEvent.click(screen.getByLabelText("色を #e5c07b に変更"));
    expect(onUpdateAccount).toHaveBeenCalledWith("acc-1", {
      color: "#e5c07b",
    });
  });

  it("削除ボタンでonRemoveAccountが呼ばれる", () => {
    const onRemoveAccount = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={onRemoveAccount}
        onSetDefault={vi.fn()}
        onUpdateAccount={vi.fn()}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("アカウントA を削除"));
    expect(onRemoveAccount).toHaveBeenCalledWith("acc-1");
  });

  it("再認証ボタンでonReauthAccountが呼ばれる", () => {
    const onReauthAccount = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onUpdateAccount={vi.fn()}
        onClose={vi.fn()}
        onReauthAccount={onReauthAccount}
      />,
    );
    fireEvent.click(screen.getByLabelText("アカウントA を再認証"));
    expect(onReauthAccount).toHaveBeenCalledWith("acc-1");
  });

  it("デフォルトアカウントのスターボタンに star SVG が表示される", () => {
    const { container } = render(
      <AccountManager
        accounts={mockAccounts}
        defaultAccountId="acc-1"
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onUpdateAccount={vi.fn()}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
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
        onUpdateAccount={vi.fn()}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
      />,
    );
    expect(
      container.querySelector('[data-testid="icon-star-outline"]'),
    ).toBeInTheDocument();
  });

  it("Escキーでoncloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onUpdateAccount={vi.fn()}
        onClose={onClose}
        onReauthAccount={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("パネル閉じるボタンに close SVG が表示される", () => {
    const { container } = render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onUpdateAccount={vi.fn()}
        onClose={vi.fn()}
        onReauthAccount={vi.fn()}
      />,
    );
    expect(
      container
        .querySelector('[aria-label="閉じる"]')
        ?.querySelector('[data-testid="icon-close"]'),
    ).toBeInTheDocument();
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    const englishAccounts: Account[] = [
      { ...mockAccounts[0], id: "acc-en-1", label: "Main" },
      { ...mockAccounts[0], id: "acc-en-2", label: "Sub", color: "#00ba7c" },
    ];

    const renderManager = (accounts: Account[]) =>
      render(
        <AccountManager
          accounts={accounts}
          defaultAccountId="acc-en-1"
          onAddAccount={vi.fn()}
          onRemoveAccount={vi.fn()}
          onSetDefault={vi.fn()}
          onUpdateAccount={vi.fn()}
          onClose={vi.fn()}
          onReauthAccount={vi.fn()}
        />,
      );

    it("表示言語が英語のときアカウント管理に日本語の文言が表示されない（アカウント0件）", async () => {
      await i18n.changeLanguage("en");
      const { container } = renderManager([]);
      expectNoJapanese(container);
      expect(screen.getByText("No accounts")).toBeInTheDocument();
      expect(screen.getByText("+ Add account")).toBeInTheDocument();
    });

    it("表示言語が英語のときアカウント管理に日本語の文言が表示されない（複数件・編集中）", async () => {
      await i18n.changeLanguage("en");
      const { container } = renderManager(englishAccounts);
      expectNoJapanese(container);
      expect(screen.getByText("Manage accounts")).toBeInTheDocument();
      expect(screen.getByLabelText("Edit Main")).toBeInTheDocument();
      expect(screen.getByLabelText("Re-authenticate Sub")).toBeInTheDocument();
      expect(screen.getByLabelText("Delete Sub")).toBeInTheDocument();
      expect(screen.getByLabelText("Set Main as default")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Edit Main"));
      expectNoJapanese(container);
      expect(screen.getByLabelText("Account name")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("アカウント管理を開いたまま表示言語を切り替えると開いている画面の文言も切り替わる", async () => {
      renderManager([{ ...mockAccounts[0], id: "acc-en-1", label: "Main" }]);
      expect(screen.getByText("アカウント管理")).toBeInTheDocument();
      expect(screen.getByLabelText("Main を編集")).toBeInTheDocument();

      await act(async () => {
        await i18n.changeLanguage("en");
      });

      expect(screen.getByText("Manage accounts")).toBeInTheDocument();
      expect(screen.getByLabelText("Edit Main")).toBeInTheDocument();
      expect(screen.queryByText("アカウント管理")).not.toBeInTheDocument();
    });
  });
});

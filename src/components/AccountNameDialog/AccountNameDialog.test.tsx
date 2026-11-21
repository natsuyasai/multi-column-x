import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import i18n from "@/i18n";
import { expectAccessibleControls } from "@/test-utils/a11y";
import { expectNoJapanese } from "@/test-utils/japanese";
import { AccountNameDialog } from "./AccountNameDialog";

describe("AccountNameDialog", () => {
  it("初期値が入力欄に表示される", () => {
    render(
      <AccountNameDialog
        defaultValue="アカウント 1"
        title="アカウント名を入力"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("アカウント名")).toHaveValue("アカウント 1");
  });

  it("確定でonSubmitに入力値が渡される", () => {
    const onSubmit = vi.fn();
    render(
      <AccountNameDialog
        defaultValue="アカウント 1"
        title="アカウント名を入力"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("アカウント名");
    fireEvent.change(input, { target: { value: "推し垢" } });
    fireEvent.click(screen.getByText("OK"));
    expect(onSubmit).toHaveBeenCalledWith("推し垢");
  });

  it("空文字ではonSubmitが呼ばれない", () => {
    const onSubmit = vi.fn();
    render(
      <AccountNameDialog
        defaultValue="アカウント 1"
        title="アカウント名を入力"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("アカウント名");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText("OK"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Escapeでキャンセルされる", () => {
    const onCancel = vi.fn();
    render(
      <AccountNameDialog
        defaultValue="アカウント 1"
        title="アカウント名を入力"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("キャンセルボタンでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <AccountNameDialog
        defaultValue="アカウント 1"
        title="アカウント名を入力"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalled();
  });

  describe("ダイアログのアクセシビリティ", () => {
    const renderDialog = (props: Partial<{ onSubmit: () => void }> = {}) =>
      render(
        <AccountNameDialog
          defaultValue="アカウント 1"
          title="アカウント名を入力"
          onSubmit={props.onSubmit ?? vi.fn()}
          onCancel={vi.fn()}
        />,
      );

    it("見出しがダイアログの名前になり aria-modal が付く", () => {
      renderDialog();
      expect(
        screen.getByRole("dialog", { name: "アカウント名を入力" }),
      ).toHaveAttribute("aria-modal", "true");
    });

    it("入力欄とボタンにアクセシブルネームがある", () => {
      const { container } = renderDialog();
      expectAccessibleControls(container);
    });

    it("閉じたあと開く前にフォーカスしていた要素へフォーカスが戻る", () => {
      const opener = document.createElement("button");
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = renderDialog();
      screen.getByLabelText("アカウント名").focus();
      unmount();

      expect(opener).toHaveFocus();
      opener.remove();
    });

    it("名前が空のとき OK ボタンは無効でクリックしても onSubmit が呼ばれない", () => {
      const onSubmit = vi.fn();
      renderDialog({ onSubmit });
      fireEvent.change(screen.getByLabelText("アカウント名"), {
        target: { value: "" },
      });

      const ok = screen.getByRole("button", { name: "OK" });
      expect(ok).toBeDisabled();
      fireEvent.click(ok);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("表示言語が英語のときアカウント名変更ダイアログに日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const { container } = render(
        <AccountNameDialog
          defaultValue="Main"
          title="Enter account name"
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expectNoJapanese(container);
      expect(screen.getByLabelText("Account name")).toHaveValue("Main");
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("OK")).toBeInTheDocument();
    });
  });
});

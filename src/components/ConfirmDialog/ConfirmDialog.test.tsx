import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("確認メッセージが表示される", () => {
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText("このアカウントを削除しますか？"),
    ).toBeInTheDocument();
  });

  it("OKでonConfirmが呼ばれる", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("OK"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("キャンセルでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("Escapeでキャンセルされる", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("titleとボタンラベルを任意指定できる", () => {
    render(
      <ConfirmDialog
        title="アカウント削除の確認"
        message="この操作は取り消せません"
        confirmLabel="削除する"
        cancelLabel="やめる"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("アカウント削除の確認")).toBeInTheDocument();
    expect(screen.getByText("削除する")).toBeInTheDocument();
    expect(screen.getByText("やめる")).toBeInTheDocument();
  });

  it("singleButton未指定時は確定・キャンセル両方のボタンが表示される", () => {
    render(
      <ConfirmDialog
        message="このアカウントを削除しますか？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
  });

  it("singleButtonのときキャンセルボタンが表示されない", () => {
    render(
      <ConfirmDialog
        singleButton
        message="再認証に失敗しました"
        confirmLabel="OK"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.queryByText("キャンセル")).not.toBeInTheDocument();
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("表示言語が英語のとき確認ダイアログの既定ラベルに日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const { container } = render(
        <ConfirmDialog
          title="Confirm"
          message="Delete this account?"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expectNoJapanese(container);
      expect(screen.getByText("OK")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("確認ダイアログを開いたまま表示言語を切り替えると既定ラベルも切り替わる", async () => {
      render(
        <ConfirmDialog
          message="Delete this account?"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByText("キャンセル")).toBeInTheDocument();

      await act(async () => {
        await i18n.changeLanguage("en");
      });

      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.queryByText("キャンセル")).not.toBeInTheDocument();
    });

    it("呼び出し元が渡したラベルは表示言語に関わらずそのまま表示される", async () => {
      await i18n.changeLanguage("en");
      render(
        <ConfirmDialog
          message="Delete?"
          confirmLabel="Remove"
          cancelLabel="Keep"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByText("Remove")).toBeInTheDocument();
      expect(screen.getByText("Keep")).toBeInTheDocument();
    });
  });
});

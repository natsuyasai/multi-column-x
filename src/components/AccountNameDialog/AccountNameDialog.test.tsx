import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateDialog } from "./UpdateDialog";

describe("UpdateDialog", () => {
  const update = { version: "1.2.0", notes: "バグ修正" };

  it("新バージョンとリリースノートを表示する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={false}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByText(/1\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/バグ修正/)).toBeInTheDocument();
  });

  it("更新するでonInstallを呼ぶ", () => {
    const onInstall = vi.fn();
    render(
      <UpdateDialog
        update={update}
        installing={false}
        onInstall={onInstall}
        onLater={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("後でonLaterを呼ぶ", () => {
    const onLater = vi.fn();
    render(
      <UpdateDialog
        update={update}
        installing={false}
        onInstall={vi.fn()}
        onLater={onLater}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "後で" }));
    expect(onLater).toHaveBeenCalledOnce();
  });

  it("installing中は更新ボタンを無効化する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={true}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /更新/ })).toBeDisabled();
  });
});

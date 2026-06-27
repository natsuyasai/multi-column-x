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

  it("ダウンロード進捗を%と進捗バーで表示する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={true}
        progress={{ phase: "downloading", downloaded: 500, total: 1000 }}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByText(/ダウンロード中.*50%/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it("totalが不明な場合は不確定のダウンロード状態を表示する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={true}
        progress={{ phase: "downloading", downloaded: 0, total: null }}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByText(/ダウンロード中/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("インストール中フェーズを表示する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={true}
        progress={{ phase: "installing" }}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByText(/インストール中/)).toBeInTheDocument();
  });

  it("再起動中フェーズを表示する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={true}
        progress={{ phase: "restarting" }}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByText(/再起動中/)).toBeInTheDocument();
  });

  it("インストール待機フェーズ(awaitingInstall)を表示する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={true}
        progress={{ phase: "awaitingInstall" }}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/完了後にインストール画面が表示されます/),
    ).toBeInTheDocument();
  });
});

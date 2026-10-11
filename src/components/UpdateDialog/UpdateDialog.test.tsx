import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";
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

  it("インストールに失敗したときはエラーが表示され、再度インストールを試せる", () => {
    const onInstall = vi.fn();
    render(
      <UpdateDialog
        update={update}
        installing={false}
        installError="更新のインストールに失敗しました。時間をおいて再度お試しください。"
        onInstall={onInstall}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "更新のインストールに失敗しました。時間をおいて再度お試しください。",
    );
    const installButton = screen.getByRole("button", { name: "更新する" });
    expect(installButton).toBeEnabled();
    fireEvent.click(installButton);
    expect(onInstall).toHaveBeenCalledOnce();
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

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    const englishUpdate = { version: "1.2.0", notes: "Bug fixes" };

    it("表示言語が英語のとき更新ダイアログに日本語の文言が表示されない（更新あり・更新中）", async () => {
      await i18n.changeLanguage("en");
      const { container, rerender } = render(
        <UpdateDialog
          update={englishUpdate}
          installing={false}
          onInstall={vi.fn()}
          onLater={vi.fn()}
        />,
      );
      expectNoJapanese(container);
      expect(
        screen.getByText("A new version is available"),
      ).toBeInTheDocument();
      expect(screen.getByText("Version 1.2.0")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Update" }),
      ).toBeInTheDocument();

      rerender(
        <UpdateDialog
          update={englishUpdate}
          installing={true}
          onInstall={vi.fn()}
          onLater={vi.fn()}
        />,
      );
      expectNoJapanese(container);
      expect(
        screen.getByRole("button", { name: "Updating..." }),
      ).toBeDisabled();
    });

    it("表示言語が英語のとき更新ダイアログの進捗表示に日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const progresses = [
        {
          progress: { phase: "downloading", downloaded: 50, total: 100 },
          text: "Downloading... 50%",
        },
        {
          progress: { phase: "downloading", downloaded: 0, total: null },
          text: "Downloading...",
        },
        { progress: { phase: "installing" }, text: "Installing..." },
        { progress: { phase: "restarting" }, text: "Restarting..." },
        {
          progress: { phase: "awaitingInstall" },
          text: "Downloading. The installer will appear when it finishes.",
        },
      ] as const;
      for (const { progress, text } of progresses) {
        const { container, unmount } = render(
          <UpdateDialog
            update={englishUpdate}
            installing={true}
            progress={progress}
            installError="Install failed."
            onInstall={vi.fn()}
            onLater={vi.fn()}
          />,
        );
        expectNoJapanese(container);
        expect(screen.getByText(text)).toBeInTheDocument();
        expect(
          screen.getByRole("progressbar", { name: "Update progress" }),
        ).toBeInTheDocument();
        unmount();
      }
    });

    it("更新ダイアログを開いたまま表示言語を切り替えると開いている画面の文言も切り替わる", async () => {
      render(
        <UpdateDialog
          update={englishUpdate}
          installing={true}
          progress={{ phase: "installing" }}
          onInstall={vi.fn()}
          onLater={vi.fn()}
        />,
      );
      expect(
        screen.getByText("新しいバージョンがあります"),
      ).toBeInTheDocument();
      expect(screen.getByText("インストール中...")).toBeInTheDocument();

      await act(async () => {
        await i18n.changeLanguage("en");
      });

      expect(
        screen.getByText("A new version is available"),
      ).toBeInTheDocument();
      expect(screen.getByText("Installing...")).toBeInTheDocument();
      expect(
        screen.queryByText("新しいバージョンがあります"),
      ).not.toBeInTheDocument();
    });
  });
});

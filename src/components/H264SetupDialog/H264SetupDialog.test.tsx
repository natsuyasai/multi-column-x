import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { H264SetupDialog } from "@/components/H264SetupDialog/H264SetupDialog";
import type {
  H264DownloadError,
  H264DownloadState,
} from "@/hooks/useH264Setup";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";

function renderDialog(
  downloadState: H264DownloadState,
  overrides: { downloadError?: H264DownloadError | null } = {},
) {
  const handlers = {
    onDownload: vi.fn(),
    onDismiss: vi.fn(),
    onClose: vi.fn(),
    onRelaunch: vi.fn(),
  };
  render(
    <H264SetupDialog
      downloadState={downloadState}
      downloadError={overrides.downloadError ?? null}
      {...handlers}
    />,
  );
  return handlers;
}

describe("H264SetupDialog", () => {
  describe("案内（idle）", () => {
    it("Cisco公式配布元から取得する旨とライセンスの説明を表示する", () => {
      renderDialog("idle");
      expect(screen.getByText(/Cisco の公式配布元/)).toBeInTheDocument();
      expect(screen.getByText(/Cisco のライセンス/)).toBeInTheDocument();
    });

    it("ダイアログとして名前付きで表示され初期フォーカスが操作ボタンに当たる", () => {
      renderDialog("idle");
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAccessibleName(/追加コンポーネント/);
      expect(
        screen.getByRole("button", { name: "ダウンロードして有効化" }),
      ).toHaveFocus();
    });

    it("案内で「今はしない」を選ぶとonDismissが呼ばれる", () => {
      const h = renderDialog("idle");
      fireEvent.click(screen.getByRole("button", { name: "今はしない" }));
      expect(h.onDismiss).toHaveBeenCalledTimes(1);
      expect(h.onClose).not.toHaveBeenCalled();
    });

    it("案内で取得に同意するとonDownloadが呼ばれる", () => {
      const h = renderDialog("idle");
      fireEvent.click(
        screen.getByRole("button", { name: "ダウンロードして有効化" }),
      );
      expect(h.onDownload).toHaveBeenCalledTimes(1);
    });

    it("案内でEscapeを押すと拒否を保存せずにonCloseが呼ばれる", () => {
      const h = renderDialog("idle");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(h.onClose).toHaveBeenCalledTimes(1);
      expect(h.onDismiss).not.toHaveBeenCalled();
    });
  });

  describe("ダウンロード中", () => {
    it("ダウンロード中の表示になり取得の操作は重ねて実行できない", () => {
      const h = renderDialog("downloading");
      expect(screen.getByText("ダウンロード中…")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
      const download = screen.getByRole("button", {
        name: "ダウンロードして有効化",
      });
      const dismiss = screen.getByRole("button", { name: "今はしない" });
      expect(download).toBeDisabled();
      expect(dismiss).toBeDisabled();
      fireEvent.click(download);
      fireEvent.click(dismiss);
      expect(h.onDownload).not.toHaveBeenCalled();
      expect(h.onDismiss).not.toHaveBeenCalled();
    });

    it("ダウンロード中はEscapeを押しても閉じない", () => {
      const h = renderDialog("downloading");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(h.onClose).not.toHaveBeenCalled();
      expect(h.onDismiss).not.toHaveBeenCalled();
    });
  });

  describe("成功", () => {
    it("成功すると再起動が必要であることと「今すぐ再起動」ボタンが表示される", () => {
      renderDialog("success");
      expect(
        screen.getByText(
          "有効化しました。反映するにはアプリの再起動が必要です。",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "今すぐ再起動" }),
      ).toBeEnabled();
    });

    it("成功を表示しただけではアプリは自動で再起動されない", () => {
      const h = renderDialog("success");
      expect(h.onRelaunch).not.toHaveBeenCalled();
    });

    it("「今すぐ再起動」を押すとアプリの再起動が要求される", () => {
      const h = renderDialog("success");
      fireEvent.click(screen.getByRole("button", { name: "今すぐ再起動" }));
      expect(h.onRelaunch).toHaveBeenCalledTimes(1);
    });

    it("「後で」を押すと拒否を保存せずにonCloseが呼ばれる", () => {
      const h = renderDialog("success");
      fireEvent.click(screen.getByRole("button", { name: "後で" }));
      expect(h.onClose).toHaveBeenCalledTimes(1);
      expect(h.onDismiss).not.toHaveBeenCalled();
      expect(h.onRelaunch).not.toHaveBeenCalled();
    });
  });

  describe("失敗", () => {
    it("失敗すると失敗した理由と再試行ボタンが表示される", () => {
      renderDialog("error", { downloadError: "ネットワークに接続できません" });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "ネットワークに接続できません",
      );
      expect(screen.getByRole("button", { name: "再試行" })).toBeEnabled();
    });

    it("失敗後に再試行するとonDownloadが呼ばれてやり直される", () => {
      const h = renderDialog("error", { downloadError: "失敗" });
      fireEvent.click(screen.getByRole("button", { name: "再試行" }));
      expect(h.onDownload).toHaveBeenCalledTimes(1);
    });

    it("失敗後に「閉じる」を押しても拒否扱いにならない", () => {
      const h = renderDialog("error", { downloadError: "失敗" });
      fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
      expect(h.onClose).toHaveBeenCalledTimes(1);
      expect(h.onDismiss).not.toHaveBeenCalled();
    });

    it("失敗後にEscapeで閉じても拒否扱いにならない", () => {
      const h = renderDialog("error", { downloadError: "失敗" });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(h.onClose).toHaveBeenCalledTimes(1);
      expect(h.onDismiss).not.toHaveBeenCalled();
    });

    it("失敗理由が空でも案内文が表示される", () => {
      renderDialog("error", { downloadError: null });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "ダウンロードに失敗しました。",
      );
    });
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("表示言語が英語のときH.264設定ダイアログの各状態に日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const states: H264DownloadState[] = [
        "idle",
        "downloading",
        "success",
        "error",
      ];
      for (const state of states) {
        const { container, unmount } = render(
          <H264SetupDialog
            downloadState={state}
            downloadError={null}
            onDownload={vi.fn()}
            onDismiss={vi.fn()}
            onClose={vi.fn()}
            onRelaunch={vi.fn()}
          />,
        );
        expectNoJapanese(container);
        expect(screen.getByRole("dialog")).toHaveAccessibleName(
          "Additional component for video playback",
        );
        unmount();
      }
    });

    it("表示言語が英語のときH.264設定ダイアログの操作ボタンと案内が英語で表示される", async () => {
      await i18n.changeLanguage("en");
      const { rerender } = render(
        <H264SetupDialog
          downloadState="idle"
          downloadError={null}
          onDownload={vi.fn()}
          onDismiss={vi.fn()}
          onClose={vi.fn()}
          onRelaunch={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Not now" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Download and enable" }),
      ).toBeInTheDocument();

      rerender(
        <H264SetupDialog
          downloadState="success"
          downloadError={null}
          onDownload={vi.fn()}
          onDismiss={vi.fn()}
          onClose={vi.fn()}
          onRelaunch={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Restart now" }),
      ).toBeInTheDocument();

      rerender(
        <H264SetupDialog
          downloadState="error"
          downloadError={null}
          onDownload={vi.fn()}
          onDismiss={vi.fn()}
          onClose={vi.fn()}
          onRelaunch={vi.fn()}
        />,
      );
      expect(screen.getByRole("alert")).toHaveTextContent("Download failed.");
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("表示言語が英語のときH.264の取得失敗が英語で表示され日本語を含まない", async () => {
      await i18n.changeLanguage("en");
      const { container } = render(
        <H264SetupDialog
          downloadState="error"
          downloadError={{ code: "h264.unsupportedArch", detail: "aarch64" }}
          onDownload={vi.fn()}
          onDismiss={vi.fn()}
          onClose={vi.fn()}
          onRelaunch={vi.fn()}
        />,
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This environment (aarch64) is not supported. Automatic H.264 codec download is only available on x86_64",
      );
      expectNoJapanese(container);
    });

    it("表示言語が日本語のときH.264の取得失敗が従来と同じ文言で表示される", () => {
      renderDialog("error", {
        downloadError: { code: "h264.extractFailed", detail: "bad data" },
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "bzip2展開に失敗しました: bad data",
      );
    });

    it("取得失敗の表示は表示言語の切替に追従する", async () => {
      const element = (
        <H264SetupDialog
          downloadState="error"
          downloadError={{ code: "h264.downloadTimeout", detail: "timed out" }}
          onDownload={vi.fn()}
          onDismiss={vi.fn()}
          onClose={vi.fn()}
          onRelaunch={vi.fn()}
        />
      );
      render(element);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "ダウンロードがタイムアウトしました: timed out",
      );

      await act(() => i18n.changeLanguage("en"));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "The download timed out: timed out",
      );
    });
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodecWarningDialog } from "./CodecWarningDialog";

describe("CodecWarningDialog", () => {
  const mockOnClose = vi.fn();
  const mockOnDownloadH264 = vi.fn();
  const mockOnRelaunch = vi.fn();

  const defaultProps = {
    onClose: mockOnClose,
    h264DownloadState: "idle" as const,
    h264DownloadError: null,
    onDownloadH264: mockOnDownloadH264,
    onRelaunch: mockOnRelaunch,
  };

  it("H.264のみ欠如時、H.264の案内を表示しAACの案内は表示しない", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        {...defaultProps}
      />,
    );
    expect(
      screen.getByText(/H\.264 \(動画\) のデコーダが見つかりません/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AAC/)).not.toBeInTheDocument();
  });

  it("AACのみ欠如時、AACの案内を表示しH.264の案内は表示しない", () => {
    render(
      <CodecWarningDialog
        missingH264={false}
        missingAac={true}
        {...defaultProps}
      />,
    );
    expect(screen.getByText(/AAC/)).toBeInTheDocument();
    expect(
      screen.queryByText(/H\.264 \(動画\) のデコーダが見つかりません/),
    ).not.toBeInTheDocument();
  });

  it("両方欠如時は両方の案内が表示される", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={true}
        {...defaultProps}
      />,
    );
    expect(
      screen.getByText(/H\.264 \(動画\) のデコーダが見つかりません/),
    ).toBeInTheDocument();
    expect(screen.getByText(/AAC/)).toBeInTheDocument();
  });

  it("閉じるボタンをクリックするとonCloseが呼ばれる", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        {...defaultProps}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("インストールコマンド例(apt/dnf/pacman)がすべて表示されている", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={true}
        {...defaultProps}
      />,
    );
    expect(
      screen.getByText(
        "sudo apt install gstreamer1.0-plugins-bad gstreamer1.0-libav",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "sudo dnf install gstreamer1-plugins-bad-free gstreamer1-libav",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("sudo pacman -S gst-plugins-bad gst-libav"),
    ).toBeInTheDocument();
  });

  it("missingH264がtrueかつh264DownloadState='idle'のとき、ダウンロードボタンが表示され、クリックでonDownloadH264が呼ばれる", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        {...defaultProps}
        h264DownloadState="idle"
      />,
    );
    const downloadBtn = screen.getByRole("button", {
      name: /H\.264をダウンロードして有効化/,
    });
    expect(downloadBtn).toBeInTheDocument();
    fireEvent.click(downloadBtn);
    expect(mockOnDownloadH264).toHaveBeenCalledOnce();
  });

  it("h264DownloadState='downloading'のとき、ダウンロード中の表示が出て、ボタンが無効化されている", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        {...defaultProps}
        h264DownloadState="downloading"
      />,
    );
    expect(screen.getByText("ダウンロード中...")).toBeInTheDocument();
  });

  it("h264DownloadState='success'のとき、再起動を促す文言と再起動ボタンが表示され、クリックでonRelaunchが呼ばれる", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        {...defaultProps}
        h264DownloadState="success"
      />,
    );
    expect(
      screen.getByText(
        /有効化しました。反映するにはアプリの再起動が必要です。/,
      ),
    ).toBeInTheDocument();
    const relaunchBtn = screen.getByRole("button", {
      name: /今すぐ再起動/,
    });
    expect(relaunchBtn).toBeInTheDocument();
    fireEvent.click(relaunchBtn);
    expect(mockOnRelaunch).toHaveBeenCalledOnce();
  });

  it("h264DownloadState='error'のとき、h264DownloadErrorの内容が表示される", () => {
    const errorMsg = "ダウンロードに失敗しました";
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        {...defaultProps}
        h264DownloadState="error"
        h264DownloadError={errorMsg}
      />,
    );
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });
});

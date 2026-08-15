import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodecWarningDialog } from "./CodecWarningDialog";

describe("CodecWarningDialog", () => {
  it("H.264のみ欠如時、H.264の案内を表示しAACの案内は表示しない", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/H\.264/)).toBeInTheDocument();
    expect(screen.queryByText(/AAC/)).not.toBeInTheDocument();
  });

  it("AACのみ欠如時、AACの案内を表示しH.264の案内は表示しない", () => {
    render(
      <CodecWarningDialog
        missingH264={false}
        missingAac={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/AAC/)).toBeInTheDocument();
    expect(screen.queryByText(/H\.264/)).not.toBeInTheDocument();
  });

  it("両方欠如時は両方の案内が表示される", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/H\.264/)).toBeInTheDocument();
    expect(screen.getByText(/AAC/)).toBeInTheDocument();
  });

  it("閉じるボタンをクリックするとonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={false}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("インストールコマンド例(apt/dnf/pacman)がすべて表示されている", () => {
    render(
      <CodecWarningDialog
        missingH264={true}
        missingAac={true}
        onClose={vi.fn()}
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
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpPopover } from "@/components/HelpPopover/HelpPopover";

describe("HelpPopover", () => {
  it("初期状態ではポップオーバーが表示されない", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("トリガーボタンをクリックするとポップオーバーが表示され説明文が見える", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    fireEvent.click(screen.getByRole("button", { name: "正規表現の書き方" }));

    const dialog = screen.getByRole("dialog", { name: "正規表現の書き方" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("説明文");
  });

  it("表示中に再度トリガーボタンをクリックすると閉じる", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    const trigger = screen.getByRole("button", { name: "正規表現の書き方" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("表示中にEscapeキーを押すと閉じる", () => {
    render(<HelpPopover label="正規表現の書き方">説明文</HelpPopover>);

    fireEvent.click(screen.getByRole("button", { name: "正規表現の書き方" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("表示中にポップオーバー外側をクリックすると閉じる", () => {
    render(
      <div>
        <div data-testid="outside">外側</div>
        <HelpPopover label="正規表現の書き方">説明文</HelpPopover>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "正規表現の書き方" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

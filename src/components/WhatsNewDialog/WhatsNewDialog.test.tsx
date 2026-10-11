import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";
import { WhatsNewDialog } from "./WhatsNewDialog";

describe("WhatsNewDialog", () => {
  it("タイトルが表示される", () => {
    render(<WhatsNewDialog notes="" onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "アプリが更新されました" }),
    ).toBeInTheDocument();
  });

  it("versionを渡すとバージョン文言が表示される", () => {
    render(<WhatsNewDialog version="0.2.0" notes="" onClose={vi.fn()} />);
    expect(screen.getByText("バージョン 0.2.0 の更新内容")).toBeInTheDocument();
  });

  it("versionを渡さないとバージョン文言が表示されない", () => {
    render(<WhatsNewDialog notes="" onClose={vi.fn()} />);
    expect(
      screen.queryByText(/バージョン.*の更新内容/),
    ).not.toBeInTheDocument();
  });

  it("notesの見出し行が h3 として描画され # マーカーが表示されない", () => {
    render(
      <WhatsNewDialog
        notes={"### 新機能\n- 項目A\n- 項目B"}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "新機能" }),
    ).toBeInTheDocument();
    // "#" マーカーが文字としてそのまま出ていないこと
    expect(screen.queryByText(/^###/)).not.toBeInTheDocument();
  });

  it("notesのリスト行が li として描画され - マーカーが表示されない", () => {
    render(
      <WhatsNewDialog
        notes={"### 新機能\n- 項目A\n- 項目B"}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("項目A")).toBeInTheDocument();
    expect(screen.getByText("項目B")).toBeInTheDocument();
    // "- " マーカーが文字としてそのまま出ていないこと
    expect(screen.queryByText(/^- 項目A/)).not.toBeInTheDocument();
  });

  it("閉じるクリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<WhatsNewDialog notes="" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("notesにHTML文字列が含まれてもXSSにならずテキストとして表示される", () => {
    const xssNotes = "<img src=x onerror=alert(1)>";
    render(<WhatsNewDialog notes={xssNotes} onClose={vi.fn()} />);
    // img 要素として解釈されていないこと
    expect(document.querySelector("img")).not.toBeInTheDocument();
    // 生テキストとして存在すること
    expect(
      document.body.textContent?.includes("<img src=x onerror=alert(1)>"),
    ).toBe(true);
  });

  it("## プレフィックスの見出し行も h3 として描画される", () => {
    render(
      <WhatsNewDialog notes={"## 修正内容\n- 不具合修正"} onClose={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "修正内容" }),
    ).toBeInTheDocument();
  });

  it("* プレフィックスのリスト行も li として描画される", () => {
    render(<WhatsNewDialog notes={"* 改善点"} onClose={vi.fn()} />);
    expect(screen.getByText("改善点")).toBeInTheDocument();
  });

  it("見出しでもリストでもない行は p として描画される", () => {
    render(<WhatsNewDialog notes={"通常テキスト行"} onClose={vi.fn()} />);
    expect(screen.getByText("通常テキスト行")).toBeInTheDocument();
  });

  describe("表示言語", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ja");
    });

    it("表示言語が英語のとき更新内容ダイアログの枠に日本語の文言が表示されない", async () => {
      await i18n.changeLanguage("en");
      const { container } = render(
        <WhatsNewDialog
          version="0.2.0"
          notes={"### New features\n- Item A\n\nPlain line"}
          onClose={vi.fn()}
        />,
      );
      expectNoJapanese(container);
      expect(
        screen.getByRole("heading", { name: "The app has been updated" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("What's new in version 0.2.0"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    });
  });
});

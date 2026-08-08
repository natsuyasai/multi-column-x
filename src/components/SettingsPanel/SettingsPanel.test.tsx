import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Column } from "../../types";
import { SettingsPanel } from "./SettingsPanel";

const baseSettings = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: true,
  hideHeaderEnabled: false,
  hideTweetInputEnabled: false,
  showCustomMenu: false,
  scrollPosRestoreEnabled: false,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  whitelistEnabled: false,
  whitelistWords: [],
};

const mockColumn: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: baseSettings,
};

const defaultProps = {
  column: mockColumn,
  onApply: vi.fn(),
  onClose: vi.fn(),
  isMobile: false,
};

describe("SettingsPanel", () => {
  it("EscキーでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("再読み込みボタンが表示される", () => {
    render(<SettingsPanel {...defaultProps} onReload={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "再読み込み" }),
    ).toBeInTheDocument();
  });

  it("再読み込みボタンをクリックするとonReloadが列IDで呼ばれる", async () => {
    const onReload = vi.fn();
    render(<SettingsPanel {...defaultProps} onReload={onReload} />);
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onReload).toHaveBeenCalledWith("col-1");
  });

  it("再読み込みボタンをクリックするとパネルが閉じてからリロードされる", async () => {
    const onClose = vi.fn();
    const onReload = vi.fn();
    render(
      <SettingsPanel {...defaultProps} onClose={onClose} onReload={onReload} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onClose).toHaveBeenCalled();
    expect(onReload).toHaveBeenCalledWith("col-1");
  });
});

describe("SettingsPanel NGワード", () => {
  it("NGワードセクションが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("NGワード")).toBeInTheDocument();
  });

  it("NGワード入力エリアが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByPlaceholderText(
        "1行に1ワードで入力（/正規表現/flags 形式も指定可）",
      ),
    ).toBeInTheDocument();
  });

  it("既存のngWordsが入力エリアに表示される", () => {
    const col = {
      ...mockColumn,
      settings: { ...baseSettings, ngWords: ["スパム", "宣伝"] },
    };
    render(<SettingsPanel {...defaultProps} column={col} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（/正規表現/flags 形式も指定可）",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("スパム\n宣伝");
  });

  it("適用するとngWordsが配列として渡される", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}bot");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
      350,
    );
  });

  it("空行は無視してngWordsに含めない", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}{Enter}bot");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
      350,
    );
  });

  it("NGワードの書き方ヘルプポップオーバーが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "NGワードの書き方" }),
    ).toBeInTheDocument();
  });

  it("不正な正規表現を入力して適用すると、エラーメッセージが表示されonApplyが呼ばれない", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "/[[/");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(screen.getByText("正規表現が不正です: /[/")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("有効なNGワード（通常文字列・正規表現）を入力して適用すると、エラーは表示されずonApplyが呼ばれる", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}/foo|bar/i");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(screen.queryByText(/正規表現が不正です/)).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ ngWords: ["spam", "/foo|bar/i"] }),
      350,
    );
  });
});

describe("SettingsPanel ホワイトリスト", () => {
  const whitelistPlaceholder =
    "1行に1ワードで入力（/正規表現/flags 形式も指定可、ホワイトリスト）";

  it("ホワイトリストセクションが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("ホワイトリスト")).toBeInTheDocument();
  });

  it("チェックボックスが表示され初期状態はwhitelistEnabledの値を反映する(false)", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "ホワイトリストを有効にする" }),
    ).not.toBeChecked();
  });

  it("チェックボックスが表示され初期状態はwhitelistEnabledの値を反映する(true)", () => {
    const col = {
      ...mockColumn,
      settings: { ...baseSettings, whitelistEnabled: true },
    };
    render(<SettingsPanel {...defaultProps} column={col} />);
    expect(
      screen.getByRole("checkbox", { name: "ホワイトリストを有効にする" }),
    ).toBeChecked();
  });

  it("チェックボックスがOFFのときワード入力欄がdisabledになっている", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText(whitelistPlaceholder)).toBeDisabled();
  });

  it("チェックボックスをONにするとワード入力欄が編集可能になる", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "ホワイトリストを有効にする" }),
    );
    expect(
      screen.getByPlaceholderText(whitelistPlaceholder),
    ).not.toBeDisabled();
  });

  it("既存のwhitelistWordsが入力エリアに改行区切りで表示される", () => {
    const col = {
      ...mockColumn,
      settings: {
        ...baseSettings,
        whitelistEnabled: true,
        whitelistWords: ["推し", "限定"],
      },
    };
    render(<SettingsPanel {...defaultProps} column={col} />);
    const textarea = screen.getByPlaceholderText(
      whitelistPlaceholder,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("推し\n限定");
  });

  it("適用するとwhitelistWordsが配列としてonApplyに渡される（空行は無視）", async () => {
    const onApply = vi.fn();
    const col = {
      ...mockColumn,
      settings: { ...baseSettings, whitelistEnabled: true },
    };
    render(<SettingsPanel {...defaultProps} column={col} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(whitelistPlaceholder);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "推し{Enter}{Enter}限定");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ whitelistWords: ["推し", "限定"] }),
      350,
    );
  });

  it("不正な正規表現形式のワードを入力して適用すると、エラーメッセージが表示されonApplyが呼ばれない", async () => {
    const onApply = vi.fn();
    const col = {
      ...mockColumn,
      settings: { ...baseSettings, whitelistEnabled: true },
    };
    render(<SettingsPanel {...defaultProps} column={col} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(whitelistPlaceholder);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "/[[/");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(screen.getByText("正規表現が不正です: /[/")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("ホワイトリストの書き方ヘルプポップオーバーが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "ホワイトリストの書き方" }),
    ).toBeInTheDocument();
  });
});

describe("SettingsPanel 表示設定", () => {
  it("ヘッダーを非表示にするチェックボックスが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "ヘッダーを非表示にする" }),
    ).toBeInTheDocument();
  });

  it("投稿欄を非表示にするチェックボックスが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "投稿欄を非表示にする" }),
    ).toBeInTheDocument();
  });

  it("hideHeaderEnabledがfalseの場合カスタムメニューボタンのチェックボックスは表示されない", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.queryByRole("checkbox", {
        name: "カスタムメニューボタンを表示する",
      }),
    ).not.toBeInTheDocument();
  });

  it("hideHeaderEnabledがtrueの場合カスタムメニューボタンのチェックボックスが表示される", () => {
    const col = {
      ...mockColumn,
      settings: { ...baseSettings, hideHeaderEnabled: true },
    };
    render(<SettingsPanel {...defaultProps} column={col} />);
    expect(
      screen.getByRole("checkbox", {
        name: "カスタムメニューボタンを表示する",
      }),
    ).toBeInTheDocument();
  });

  it("ヘッダーを非表示にするチェックボックスを操作すると設定に反映される", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "ヘッダーを非表示にする" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({
        hideHeaderEnabled: true,
        hideTweetInputEnabled: false,
      }),
      350,
    );
  });

  it("投稿欄を非表示にするチェックボックスを操作すると設定に反映される", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "投稿欄を非表示にする" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({
        hideHeaderEnabled: false,
        hideTweetInputEnabled: true,
      }),
      350,
    );
  });

  it("ヘッダーのみ非表示にした場合、投稿欄は非表示にならないこと", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "ヘッダーを非表示にする" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    const appliedSettings = onApply.mock.calls[0][1];
    expect(appliedSettings.hideHeaderEnabled).toBe(true);
    expect(appliedSettings.hideTweetInputEnabled).toBe(false);
  });
});

describe("SettingsPanel pageTypeがexternalの場合", () => {
  const externalColumn: Column = {
    ...mockColumn,
    pageType: "external",
    customUrl: "https://example.com",
  };

  it("pageTypeがexternalの場合自動更新セクションが表示されない", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.queryByText("自動更新")).not.toBeInTheDocument();
  });

  it("pageTypeがexternalの場合表示セクションが表示されない", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.queryByText("表示")).not.toBeInTheDocument();
  });

  it("pageTypeがexternalの場合画像セクションが表示されない", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.queryByText("画像")).not.toBeInTheDocument();
  });

  it("pageTypeがexternalの場合画像ブラーセクションが表示されない", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.queryByText("画像ブラー")).not.toBeInTheDocument();
  });

  it("pageTypeがexternalの場合通知セクションが表示されない", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.queryByText("通知")).not.toBeInTheDocument();
  });

  it("pageTypeがexternalの場合ngワードセクションが表示されない", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.queryByText("NGワード")).not.toBeInTheDocument();
  });

  it("pageTypeがexternalの場合ホワイトリストセクションが表示されない", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.queryByText("ホワイトリスト")).not.toBeInTheDocument();
  });

  it("pageTypeがexternalの場合カスタムcssセクションは表示される", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.getByText("カスタム CSS")).toBeInTheDocument();
  });

  it("pageTypeがexternalの場合カラム幅セクションは表示される", () => {
    render(<SettingsPanel {...defaultProps} column={externalColumn} />);
    expect(screen.getByText("カラム")).toBeInTheDocument();
  });

  it("pageTypeがexternal以外の場合すべてのセクションが表示される", () => {
    render(<SettingsPanel {...defaultProps} column={mockColumn} />);
    expect(screen.getByText("カラム")).toBeInTheDocument();
    expect(screen.getByText("自動更新")).toBeInTheDocument();
    expect(screen.getByText("表示")).toBeInTheDocument();
    expect(screen.getByText("画像")).toBeInTheDocument();
    expect(screen.getByText("画像ブラー")).toBeInTheDocument();
    expect(screen.getByText("通知")).toBeInTheDocument();
    expect(screen.getByText("NGワード")).toBeInTheDocument();
    expect(screen.getByText("ホワイトリスト")).toBeInTheDocument();
    expect(screen.getByText("カスタム CSS")).toBeInTheDocument();
  });
});

describe("SettingsPanel 新着デスクトップ通知", () => {
  it("新着通知トグルが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "新着をデスクトップ通知する" }),
    ).toBeInTheDocument();
  });

  it("既存のdesktopNotifyEnabledがトグルの初期状態に反映される", () => {
    const col = {
      ...mockColumn,
      settings: { ...baseSettings, desktopNotifyEnabled: true },
    };
    render(<SettingsPanel {...defaultProps} column={col} />);
    expect(
      screen.getByRole("checkbox", { name: "新着をデスクトップ通知する" }),
    ).toBeChecked();
  });

  it("新着通知トグルが設定に反映される", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "新着をデスクトップ通知する" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ desktopNotifyEnabled: true }),
      350,
    );
  });
});

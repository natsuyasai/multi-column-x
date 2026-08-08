import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GlobalSettings, Column, Account } from "../../types";
import { AppSettingsPanel } from "./AppSettingsPanel";

const mockStoreState = {
  isMobile: false,
  savePreset: vi.fn(),
  loadPreset: vi.fn(),
  deletePreset: vi.fn(),
};

vi.mock("../../store/useAppStore", () => ({
  useAppStore: vi.fn((selector?: (s: unknown) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState,
  ),
}));

const baseGlobalSettings: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  defaultShowCountdown: true,
  defaultHideHeaderEnabled: true,
  defaultHideTweetInputEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: false,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: true,
  imagePopupEnabled: true,
  videoPopupEnabled: true,
  showSortButtons: false,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: true,
  apiRateLimitMonitorEnabled: true,
  columnScale: "default",
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
  mobileTwoColumnEnabled: true,
  presets: [],
  ngWords: [],
};

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  hideHeaderEnabled: true,
  hideTweetInputEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
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

const mockAccounts: Account[] = [
  {
    id: "acc-1",
    label: "テスト",
    dataDirectory: "/data",
    color: "#1d9bf0",
    createdAt: "2026-05-03T00:00:00Z",
  },
];

const mockColumns: Column[] = [
  {
    id: "c1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
  },
];

const defaultProps = {
  settings: baseGlobalSettings,
  columns: [],
  accounts: [],
  onApply: vi.fn(),
  onApplyLayout: vi.fn(),
  onApplyColumnDefaults: vi.fn(),
  onReloadAllWebviews: vi.fn(),
  appVersion: "0.1.1",
  updateChecking: false,
  updateManualResult: "idle" as const,
  onCheckUpdate: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  mockStoreState.isMobile = false;
});

describe("AppSettingsPanel", () => {
  it("EscキーでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AppSettingsPanel グローバルNGワード", () => {
  it("グローバルNGワードセクションが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(screen.getByText("グローバルNGワード")).toBeInTheDocument();
  });

  it("グローバルNGワード入力エリアが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByPlaceholderText(
        "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
      ),
    ).toBeInTheDocument();
  });

  it("既存のglobalNgWordsが入力エリアに表示される", () => {
    const settings = {
      ...baseGlobalSettings,
      ngWords: ["グローバルスパム", "宣伝"],
    };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("グローバルスパム\n宣伝");
  });

  it("適用するとngWordsが配列としてonApplyに渡される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
    fireEvent.change(textarea, { target: { value: "spam\nbot" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
    );
  });

  it("空行はngWordsに含めない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
    fireEvent.change(textarea, { target: { value: "spam\n\nbot" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
    );
  });

  it("NGワードの書き方ヘルプポップオーバーが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "NGワードの書き方" }),
    ).toBeInTheDocument();
  });

  it("不正な正規表現を入力して適用すると、エラーメッセージが表示されonApplyもonCloseも呼ばれない", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "/[[/");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(screen.getByText("正規表現が不正です: /[/")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("有効なNGワード（通常文字列・正規表現）を入力して適用すると、エラーは表示されずonApplyとonCloseが呼ばれる", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}/foo|bar/i");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(screen.queryByText(/正規表現が不正です/)).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam", "/foo|bar/i"] }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AppSettingsPanel スワイプ切替設定", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("スワイプ領域の有効トグルを切り替えるとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const checkbox = screen.getByRole("checkbox", {
      name: "スワイプでカラム切替を有効化",
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaEnabled: false }),
    );
  });

  it("広い画面で2カラム表示トグルを切り替えるとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const checkbox = screen.getByRole("checkbox", {
      name: "広い画面で2カラム表示（タブレット・横向き）",
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileTwoColumnEnabled: false }),
    );
  });

  it("スワイプ領域の高さは16〜56にクランプされる", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    });
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaHeight: 56 }),
    );
  });

  it("スワイプ領域の高さに下限未満の値を入力すると16にクランプされる", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    });
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaHeight: 16 }),
    );
  });

  it("高さ入力を空にしても即座に補正されず入力中の値を保持できる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "40" } });
    expect(input.value).toBe("40");
  });

  it("高さ入力からフォーカスが外れると有効範囲へ補正される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("16");
  });
});

describe("AppSettingsPanel モバイルのカラム並び替え", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("isMobile=true でもカラム配置タブが表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    expect(
      screen.getByRole("button", { name: "カラム配置" }),
    ).toBeInTheDocument();
  });

  it("isMobile=true でカラム配置タブを開くと表示順序セクションが表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "カラム配置" }));
    expect(screen.getByText("表示順序")).toBeInTheDocument();
  });

  it("isMobile=true のカラム配置タブではグリッドエディタが非表示", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "カラム配置" }));
    // 列数入力（グリッドエディタ）が表示されない
    expect(screen.queryByText("列数:")).not.toBeInTheDocument();
  });
});

describe("AppSettingsPanel ポップアップウィンドウ", () => {
  it("画像・動画をポップアップで開くトグルが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", {
        name: "画像をポップアップウィンドウで開く",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "動画をポップアップウィンドウで開く",
      }),
    ).toBeInTheDocument();
  });

  it("各トグルの初期checked状態がsettingsの値を反映する", () => {
    const settings = {
      ...baseGlobalSettings,
      imagePopupEnabled: false,
      videoPopupEnabled: true,
    };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    expect(
      screen.getByRole("checkbox", {
        name: "画像をポップアップウィンドウで開く",
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "動画をポップアップウィンドウで開く",
      }),
    ).toBeChecked();
  });

  it("画像ポップアップトグルを切り替えて適用するとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "画像をポップアップウィンドウで開く",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ imagePopupEnabled: false }),
    );
  });

  it("動画ポップアップトグルを切り替えて適用するとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "動画をポップアップウィンドウで開く",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ videoPopupEnabled: false }),
    );
  });
});

describe("AppSettingsPanel カラムデフォルト - 表示", () => {
  it("ヘッダーを非表示にするチェックボックスが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "ヘッダーを非表示にする" }),
    ).toBeInTheDocument();
  });

  it("投稿欄を非表示にするチェックボックスが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "投稿欄を非表示にする" }),
    ).toBeInTheDocument();
  });

  it("defaultHideHeaderEnabledがfalseの場合カスタムメニューボタンのチェックボックスは表示されない", () => {
    const settings = { ...baseGlobalSettings, defaultHideHeaderEnabled: false };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    expect(
      screen.queryByRole("checkbox", {
        name: "カスタムメニューボタンを表示する",
      }),
    ).not.toBeInTheDocument();
  });

  it("defaultHideHeaderEnabledがtrueの場合カスタムメニューボタンのチェックボックスが表示される", () => {
    const settings = { ...baseGlobalSettings, defaultHideHeaderEnabled: true };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    expect(
      screen.getByRole("checkbox", {
        name: "カスタムメニューボタンを表示する",
      }),
    ).toBeInTheDocument();
  });

  it("ヘッダーを非表示にするチェックボックスを操作して適用するとonApplyに反映される", () => {
    const onApply = vi.fn();
    const settings = {
      ...baseGlobalSettings,
      defaultHideHeaderEnabled: false,
      defaultHideTweetInputEnabled: false,
    };
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "ヘッダーを非表示にする" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHideHeaderEnabled: true,
        defaultHideTweetInputEnabled: false,
      }),
    );
  });

  it("投稿欄を非表示にするチェックボックスを操作して適用するとonApplyに反映される", () => {
    const onApply = vi.fn();
    const settings = {
      ...baseGlobalSettings,
      defaultHideHeaderEnabled: false,
      defaultHideTweetInputEnabled: false,
    };
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "投稿欄を非表示にする" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHideHeaderEnabled: false,
        defaultHideTweetInputEnabled: true,
      }),
    );
  });

  it("ヘッダーのみ非表示のデフォルト設定にした場合、投稿欄はデフォルトで非表示にならないこと", () => {
    const onApply = vi.fn();
    const settings = {
      ...baseGlobalSettings,
      defaultHideHeaderEnabled: false,
      defaultHideTweetInputEnabled: false,
    };
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "ヘッダーを非表示にする" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    const appliedSettings = onApply.mock.calls[0][0];
    expect(appliedSettings.defaultHideHeaderEnabled).toBe(true);
    expect(appliedSettings.defaultHideTweetInputEnabled).toBe(false);
  });

  it("既存の全カラムに適用ボタンでhideHeaderEnabled/hideTweetInputEnabledがonApplyColumnDefaultsに渡される", () => {
    const onApplyColumnDefaults = vi.fn();
    const settings = {
      ...baseGlobalSettings,
      defaultHideHeaderEnabled: true,
      defaultHideTweetInputEnabled: false,
    };
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        onApplyColumnDefaults={onApplyColumnDefaults}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "既存の全カラムに適用" }),
    );
    expect(onApplyColumnDefaults).toHaveBeenCalledWith(
      expect.objectContaining({
        hideHeaderEnabled: true,
        hideTweetInputEnabled: false,
      }),
    );
  });
});

describe("AppSettingsPanel テーマ選択", () => {
  it("テーマでライトを選び適用するとonApplyにtheme:lightが渡る", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "ライト" }));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light" }),
    );
  });

  it("現在のテーマ設定がアクティブ表示される", () => {
    const settings = { ...baseGlobalSettings, theme: "system" as const };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    const btn = screen.getByRole("button", { name: "システム" });
    expect(btn.className).toContain("scaleBtnActive");
  });
});

import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { handleAndroidBack } from "@/lib/androidBackHandler";
import * as extensionsService from "@/services/extensions";
import { expectAccessibleControls } from "@/test-utils/a11y";
import { expectNoJapanese } from "@/test-utils/japanese";
import type { GlobalSettings, Column, Account } from "../../types";
import { AppSettingsPanel } from "./AppSettingsPanel";

const mockPlatform = vi.hoisted(() => vi.fn(() => "windows"));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: mockPlatform,
}));

vi.mock("@/services/extensions", () => ({
  listExtensions: vi.fn(async () => []),
  detectChromeExtensions: vi.fn(),
  pickExtensionFolder: vi.fn(),
  addExtensionFromFolder: vi.fn(),
  addChromeExtension: vi.fn(),
  setExtensionEnabled: vi.fn(),
  removeExtension: vi.fn(),
  openExtensionPage: vi.fn(),
}));

const mockStoreState = {
  isMobile: false,
  accounts: [] as Account[],
  settingsSaveBlocked: false,
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
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: true,
  hideGrokButtonEnabled: false,
  apiRateLimitMonitorEnabled: true,
  columnScale: "default",
  uiScale: "auto",
  language: "auto",
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
  mobileSwipeAreaOpacity: 50,
  mobileTwoColumnEnabled: true,
  mobileColumnCount: 2,
  presets: [],
  ngWords: [],
  repostHiddenUserIds: [],
  pendingDataDirectoryDeletions: [],
  hardwareVideoDecodeEnabled: true,
  h264DownloadPromptDismissed: false,
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
  repostHiddenUserIds: [],
  whitelistEnabled: false,
  whitelistWords: [],
  returnToLastReadEnabled: false,
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
  onLoadPreset: vi.fn().mockResolvedValue(undefined),
  onReplaceColumnsAndRecreate: vi.fn().mockResolvedValue(undefined),
  onExtensionsChanged: vi.fn(),
  extensionPageAccountId: "acc-1" as string | null,
  appVersion: "0.1.1",
  updateChecking: false,
  updateManualResult: "idle" as const,
  onCheckUpdate: vi.fn(),
  onOpenOfficialSettings: vi.fn(),
  onClose: vi.fn(),
  pendingDataDirectoryDeletionCount: 0,
  onRetryDataDirectoryDeletion: vi.fn().mockResolvedValue({ remaining: 0 }),
};

beforeEach(() => {
  mockStoreState.isMobile = false;
  mockPlatform.mockReturnValue("windows");
});

/** サイドナビ（デスクトップ）またはカテゴリ一覧（モバイル）のカテゴリ項目。名前は印の文言で末尾が変わるため前方一致で引く */
const categoryItem = (label: string) => {
  const scope = mockStoreState.isMobile
    ? screen
    : within(screen.getByRole("navigation"));
  return scope.getByRole("button", { name: new RegExp(`^${label}`) });
};

/** カテゴリを開く（デスクトップはサイドナビ、モバイルは一覧から詳細へ） */
const openCategory = (label: string) => {
  fireEvent.click(categoryItem(label));
};

/** モバイルの詳細画面からカテゴリ一覧へ戻る */
const backToList = () => {
  fireEvent.click(screen.getByRole("button", { name: /^(戻る|Back)$/ }));
};

/** フッター（キャンセル / 適用 / 閉じる が並ぶ領域） */
const footer = () => {
  const buttons = screen.getAllByRole("button", {
    name: /^(キャンセル|閉じる)$/,
  });
  return within(buttons[buttons.length - 1].parentElement as HTMLElement);
};

describe("AppSettingsPanel", () => {
  it("EscキーでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ネイティブの閉じる要求(cancel)でもonCloseが呼ばれ、ダイアログは自動で閉じられない", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "アプリ設定" });

    const notPrevented = fireEvent(
      dialog,
      new Event("cancel", { cancelable: true }),
    );

    expect(onClose).toHaveBeenCalledOnce();
    expect(notPrevented).toBe(false);
    expect(dialog).toHaveAttribute("open");
  });
});

describe("AppSettingsPanel 開いたときの初期フォーカス", () => {
  it("デスクトップでは選択中のカテゴリ項目にフォーカスが当たる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(categoryItem("表示")).toHaveFocus();
    expect(categoryItem("表示")).toHaveAttribute("aria-current", "page");
  });

  it("Androidのカテゴリ一覧では先頭のカテゴリ項目にフォーカスが当たる", () => {
    mockStoreState.isMobile = true;
    render(<AppSettingsPanel {...defaultProps} />);
    const first = screen.getAllByRole("button", {
      name: /言語・テーマ・表示サイズ/,
    })[0];
    expect(first).toHaveFocus();
  });
});

describe("AppSettingsPanel Grok ボタンの非表示スイッチ", () => {
  it("アプリ設定の全体設定に「ポスト内の Grok ボタンを非表示にする」スイッチが既定でオフで表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    expect(
      screen.getByRole("checkbox", {
        name: "ポスト内の Grok ボタンを非表示にする",
      }),
    ).not.toBeChecked();
  });

  it("全体設定で Grok ボタンの非表示が有効なときスイッチがオンで表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={{ ...baseGlobalSettings, hideGrokButtonEnabled: true }}
      />,
    );
    openCategory("閲覧・フィルタ");
    expect(
      screen.getByRole("checkbox", {
        name: "ポスト内の Grok ボタンを非表示にする",
      }),
    ).toBeChecked();
  });

  it("スイッチを切り替えて適用すると Grok ボタンの非表示設定が保存される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("閲覧・フィルタ");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "ポスト内の Grok ボタンを非表示にする",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ hideGrokButtonEnabled: true }),
    );
  });
});

describe("AppSettingsPanel Grok ボタンの非表示スイッチ（日本語の説明）", () => {
  it("日本語表示のとき閲覧・フィルタの説明に Grok ボタンが含まれる", () => {
    mockStoreState.isMobile = true;
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByText("X公式設定・NGワード・リポスト非表示・広告・Grokボタン"),
    ).toBeInTheDocument();
  });
});

describe("AppSettingsPanel 公式設定セクション", () => {
  it("「公式設定を開く」ボタンが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    expect(
      screen.getByRole("button", { name: "公式設定を開く" }),
    ).toBeInTheDocument();
  });

  it("「公式設定を開く」ボタンをクリックするとonOpenOfficialSettingsが呼ばれる", () => {
    const onOpenOfficialSettings = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onOpenOfficialSettings={onOpenOfficialSettings}
      />,
    );
    openCategory("閲覧・フィルタ");
    fireEvent.click(screen.getByRole("button", { name: "公式設定を開く" }));
    expect(onOpenOfficialSettings).toHaveBeenCalled();
  });
});

describe("AppSettingsPanel グローバルNGワード", () => {
  it("グローバルNGワードセクションが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    expect(screen.getByText("グローバルNGワード")).toBeInTheDocument();
  });

  it("グローバルNGワード入力エリアが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
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
    openCategory("閲覧・フィルタ");
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("グローバルスパム\n宣伝");
  });

  it("適用するとngWordsが配列としてonApplyに渡される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("閲覧・フィルタ");
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
    openCategory("閲覧・フィルタ");
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
    fireEvent.change(textarea, { target: { value: "spam\n\nbot" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
    );
  });

  it("NGワードの前後の空白を除いてngWordsに含める", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("閲覧・フィルタ");
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
    fireEvent.change(textarea, { target: { value: "  spam  \n bot " } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
    );
  });

  it("NGワードの書き方ヘルプポップオーバーが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    expect(
      screen.getByRole("button", { name: "NGワードの書き方" }),
    ).toBeInTheDocument();
  });

  it("ヘルプのポップオーバーを開いているときにEscを押すとポップオーバーだけが閉じ、アプリ設定は開いたままになる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    openCategory("閲覧・フィルタ");
    const trigger = screen.getByRole("button", { name: "NGワードの書き方" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "NGワードの書き方" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "NGワードの書き方" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "アプリ設定" })).toHaveAttribute(
      "open",
    );
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
    openCategory("閲覧・フィルタ");
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

  it("不正なNGワードを修正して再度適用するとNGワードのエラーが消える", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    openCategory("閲覧・フィルタ");
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "/[[/");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(screen.getByText("正規表現が不正です: /[/")).toBeInTheDocument();

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(screen.queryByText(/正規表現が不正です/)).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam"] }),
    );
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
    openCategory("閲覧・フィルタ");
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

describe("AppSettingsPanel リポストを非表示にするユーザー", () => {
  const getTextarea = () =>
    screen.getByRole("textbox", { name: "リポストを非表示にするユーザー" });

  it("既存のrepostHiddenUserIdsが入力エリアに復元表示される", () => {
    const settings = {
      ...baseGlobalSettings,
      repostHiddenUserIds: ["HAJIME_2001", "abc"],
    };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    openCategory("閲覧・フィルタ");
    expect((getTextarea() as HTMLTextAreaElement).value).toBe(
      "HAJIME_2001\nabc",
    );
  });

  it("旧保存データでrepostHiddenUserIdsが未定義でも空の入力エリアが表示される", () => {
    const settings = {
      ...baseGlobalSettings,
      repostHiddenUserIds: undefined,
    } as unknown as GlobalSettings;
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    openCategory("閲覧・フィルタ");
    expect((getTextarea() as HTMLTextAreaElement).value).toBe("");
  });

  it("説明文が表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    expect(
      screen.getByText(
        "1行に1ユーザーID（@以降）。指定ユーザーがリポストした投稿を非表示にします",
      ),
    ).toBeInTheDocument();
  });

  it("入力は1行1IDで、空行・前後空白・先頭の@・重複は無視して正規化された一覧がonApplyに渡される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("閲覧・フィルタ");
    fireEvent.change(getTextarea(), {
      target: { value: "  @user_a  \n\nuser_b\nUSER_A\n@user_b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ repostHiddenUserIds: ["user_a", "user_b"] }),
    );
  });

  it("不正なID行があると保存できずエラーが表示される", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    openCategory("閲覧・フィルタ");
    fireEvent.change(getTextarea(), {
      target: { value: "valid_id\nbad-id!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(
      screen.getByText(
        "`bad-id!` はXのユーザーIDとして正しくありません（英数字とアンダースコアの1〜15文字）",
      ),
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("不正なID行を修正して再度適用するとエラーが消えてonApplyとonCloseが呼ばれる", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    openCategory("閲覧・フィルタ");
    fireEvent.change(getTextarea(), { target: { value: "bad-id!" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    fireEvent.change(getTextarea(), { target: { value: "good_id" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(
      screen.queryByText(/ユーザーIDとして正しくありません/),
    ).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ repostHiddenUserIds: ["good_id"] }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("16文字以上のIDは不正として保存できない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("閲覧・フィルタ");
    fireEvent.change(getTextarea(), {
      target: { value: "this_id_is_way_too_long" },
    });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe("AppSettingsPanel スワイプ切替設定", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("スワイプ領域の有効トグルを切り替えるとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("Android専用");
    const checkbox = screen.getByRole("checkbox", {
      name: "スワイプでカラム切替を有効化",
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaEnabled: false }),
    );
  });

  it("広い画面で複数カラム表示トグルを切り替えるとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("Android専用");
    const checkbox = screen.getByRole("checkbox", {
      name: "広い画面で複数カラム表示（タブレット・横向き）",
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileTwoColumnEnabled: false }),
    );
  });

  it("設定画面で複数カラム表示がONのときだけ列数を選べる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("Android専用");
    const select = screen.getByRole("combobox", { name: "同時表示する列数" });
    expect(
      Array.from((select as HTMLSelectElement).options).map((o) => o.value),
    ).toEqual(["2", "3", "4", "5", "6"]);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "広い画面で複数カラム表示（タブレット・横向き）",
      }),
    );
    expect(
      screen.queryByRole("combobox", { name: "同時表示する列数" }),
    ).toBeNull();
  });

  it("設定画面で列数を変更すると設定として保存される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("Android専用");
    fireEvent.change(
      screen.getByRole("combobox", { name: "同時表示する列数" }),
      {
        target: { value: "4" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileColumnCount: 4 }),
    );
  });

  it("スワイプ領域の高さは16〜56にクランプされる", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("Android専用");
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
    openCategory("Android専用");
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
    openCategory("Android専用");
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
    openCategory("Android専用");
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("16");
  });

  it("スワイプ領域の透過度スライダーを操作すると適用時にmobileSwipeAreaOpacityが反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("Android専用");
    const slider = screen.getByRole("slider", {
      name: /スワイプ領域の透過度/,
    });
    fireEvent.change(slider, { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaOpacity: 80 }),
    );
  });
});

describe("AppSettingsPanel モバイルのカラム並び替え", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("isMobile=true でもカラム配置カテゴリが一覧に表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    expect(categoryItem("カラム配置")).toBeInTheDocument();
  });

  it("isMobile=true でカラム配置カテゴリを開くと表示順序セクションが表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    openCategory("カラム配置");
    expect(screen.getByText("表示順序")).toBeInTheDocument();
  });

  it("isMobile=true のカラム配置カテゴリではグリッドエディタが非表示", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    openCategory("カラム配置");
    // 列数入力（グリッドエディタ）が表示されない
    expect(screen.queryByText("列数:")).not.toBeInTheDocument();
  });
});

describe("AppSettingsPanel ポップアップウィンドウ", () => {
  it("画像・動画をポップアップで開くトグルが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("メディア");
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
    openCategory("メディア");
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
    openCategory("メディア");
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
    openCategory("メディア");
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

describe("AppSettingsPanel カラム既定値 - 表示", () => {
  it("ヘッダーを非表示にするチェックボックスが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("カラム既定値");
    expect(
      screen.getByRole("checkbox", { name: "ヘッダーを非表示にする" }),
    ).toBeInTheDocument();
  });

  it("投稿欄を非表示にするチェックボックスが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("カラム既定値");
    expect(
      screen.getByRole("checkbox", { name: "投稿欄を非表示にする" }),
    ).toBeInTheDocument();
  });

  it("defaultHideHeaderEnabledがfalseの場合カスタムメニューボタンのチェックボックスは表示されない", () => {
    const settings = { ...baseGlobalSettings, defaultHideHeaderEnabled: false };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    openCategory("カラム既定値");
    expect(
      screen.queryByRole("checkbox", {
        name: "カスタムメニューボタンを表示する",
      }),
    ).not.toBeInTheDocument();
  });

  it("defaultHideHeaderEnabledがtrueの場合カスタムメニューボタンのチェックボックスが表示される", () => {
    const settings = { ...baseGlobalSettings, defaultHideHeaderEnabled: true };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    openCategory("カラム既定値");
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
    openCategory("カラム既定値");
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
    openCategory("カラム既定値");
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
    openCategory("カラム既定値");
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
    openCategory("カラム既定値");
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
    fireEvent.click(screen.getByRole("checkbox", { name: "テーマを変更する" }));
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

const カラム内ボタン = (name: string) =>
  within(screen.getByRole("group", { name: "カラム内の表示サイズ" })).getByRole(
    "button",
    { name },
  );
const アプリUIボタン = (name: string) =>
  within(screen.getByRole("group", { name: "アプリUIの表示サイズ" })).getByRole(
    "button",
    { name },
  );

describe("AppSettingsPanel 表示サイズ・テーマの変更チェックボックス", () => {
  it("チェックボックスがいずれもOFFのまま適用すると、patchにcolumnScale/themeキーが含まれない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const patch = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("columnScale");
    expect(patch).not.toHaveProperty("theme");
  });

  it("表示サイズのチェックボックスをONにして値を変更し適用すると、patchにcolumnScaleが含まれ、themeは含まれない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "カラム内の表示サイズを変更する" }),
    );
    fireEvent.click(カラム内ボタン("大"));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    const patch = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty("columnScale", "large");
    expect(patch).not.toHaveProperty("theme");
  });

  it("テーマのチェックボックスをONにして値を変更し適用すると、patchにthemeが含まれ、columnScaleは含まれない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "テーマを変更する" }));
    fireEvent.click(screen.getByRole("button", { name: "ライト" }));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    const patch = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty("theme", "light");
    expect(patch).not.toHaveProperty("columnScale");
  });

  it("表示サイズ・テーマのボタンはチェックボックスがOFFの間は操作できない", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(カラム内ボタン("大")).toBeDisabled();
    expect(アプリUIボタン("大")).toBeDisabled();
    expect(screen.getByRole("button", { name: "ライト" })).toBeDisabled();
  });

  it("パネルを開き直す（再マウント）と、チェックボックスは常にOFF状態で表示される", () => {
    const { unmount } = render(<AppSettingsPanel {...defaultProps} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "カラム内の表示サイズを変更する" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "テーマを変更する" }));
    expect(
      screen.getByRole("checkbox", { name: "カラム内の表示サイズを変更する" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "テーマを変更する" }),
    ).toBeChecked();
    unmount();

    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "カラム内の表示サイズを変更する" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "テーマを変更する" }),
    ).not.toBeChecked();
  });
});

describe("AppSettingsPanel アプリUIの表示サイズ", () => {
  it("カラム内の表示サイズとアプリUIの表示サイズは別項目として区別できる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(screen.getByText("カラム内の表示サイズ")).toBeInTheDocument();
    expect(screen.getByText("アプリUIの表示サイズ")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "カラム内の表示サイズを変更する" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "アプリUIの表示サイズを変更する" }),
    ).toBeInTheDocument();
  });

  it("アプリUIの表示サイズを大にして適用すると、patchにuiScaleが含まれ、columnScaleは含まれない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "アプリUIの表示サイズを変更する" }),
    );
    fireEvent.click(アプリUIボタン("大"));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    const patch = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty("uiScale", "large");
    expect(patch).not.toHaveProperty("columnScale");
  });

  it("アプリUIの表示サイズの変更チェックをOFFのまま適用すると、patchにuiScaleが含まれない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    const patch = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("uiScale");
  });

  it("端末に合わせるを選んで適用すると、patchのuiScaleがautoになる", () => {
    const onApply = vi.fn();
    const settings = { ...baseGlobalSettings, uiScale: "xLarge" as const };
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        onApply={onApply}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "アプリUIの表示サイズを変更する" }),
    );
    fireEvent.click(アプリUIボタン("端末に合わせる"));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    const patch = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty("uiScale", "auto");
  });

  it("アプリUIの表示サイズのボタン群はaria-pressedで選択状態を表す", () => {
    const settings = { ...baseGlobalSettings, uiScale: "small" as const };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "アプリUIの表示サイズを変更する" }),
    );
    expect(アプリUIボタン("小")).toHaveAttribute("aria-pressed", "true");
    expect(アプリUIボタン("端末に合わせる")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(アプリUIボタン("特大"));
    expect(アプリUIボタン("特大")).toHaveAttribute("aria-pressed", "true");
    expect(アプリUIボタン("小")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("AppSettingsPanel プリセット", () => {
  it("プリセットの読み込みでonLoadPresetが呼ばれる", async () => {
    const onLoadPreset = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const settings = {
      ...baseGlobalSettings,
      presets: [{ id: "preset-1", name: "プリセット1", columns: [] }],
    };
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        onLoadPreset={onLoadPreset}
        onClose={onClose}
      />,
    );
    openCategory("プリセット");
    fireEvent.click(screen.getByRole("button", { name: "読み込む" }));
    expect(onLoadPreset).toHaveBeenCalledWith("preset-1");
    // ストアの loadPreset を直接呼ばず、onLoadPreset 経由のみで読み込むこと
    expect(mockStoreState.loadPreset).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("AppSettingsPanel 設定パッチの全項目反映", () => {
  const distinctGlobalSettings: GlobalSettings = {
    ...baseGlobalSettings,
    defaultAutoReloadEnabled: false,
    defaultAutoReloadInterval: 123,
    defaultShowCountdown: false,
    defaultHideHeaderEnabled: false,
    defaultHideTweetInputEnabled: false,
    defaultShowCustomMenu: true,
    defaultScrollPosRestoreEnabled: true,
    defaultColumnCustomCSS: ".test{}",
    popupEscCloseEnabled: false,
    videoAutoPlayStopEnabled: false,
    imagePopupEnabled: false,
    videoPopupEnabled: false,
    smallImageEnabled: true,
    smallImageWidth: "70%",
    blurImageEnabled: true,
    blurImageAmount: "20px",
    hideAdEnabled: false,
    hideGrokButtonEnabled: true,
    apiRateLimitMonitorEnabled: false,
    useXAppForCompose: true,
    mobileSwipeAreaEnabled: false,
    mobileSwipeAreaHeight: 30,
    mobileSwipeAreaOpacity: 80,
    mobileTwoColumnEnabled: false,
    mobileColumnCount: 4,
    ngWords: ["spam", "bot"],
    repostHiddenUserIds: ["user_a", "user_b"],
  };

  it("適用すると全体設定の全項目がonApplyに渡される", () => {
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={distinctGlobalSettings}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      defaultAutoReloadEnabled: false,
      defaultAutoReloadInterval: 123,
      defaultShowCountdown: false,
      defaultHideHeaderEnabled: false,
      defaultHideTweetInputEnabled: false,
      defaultShowCustomMenu: true,
      defaultScrollPosRestoreEnabled: true,
      defaultColumnCustomCSS: ".test{}",
      popupEscCloseEnabled: false,
      videoAutoPlayStopEnabled: false,
      hardwareVideoDecodeEnabled: true,
      imagePopupEnabled: false,
      videoPopupEnabled: false,
      smallImageEnabled: true,
      smallImageWidth: "70%",
      blurImageEnabled: true,
      blurImageAmount: "20px",
      hideAdEnabled: false,
      hideGrokButtonEnabled: true,
      apiRateLimitMonitorEnabled: false,
      language: "auto",
      useXAppForCompose: true,
      mobileSwipeAreaEnabled: false,
      mobileSwipeAreaHeight: 30,
      mobileSwipeAreaOpacity: 80,
      mobileTwoColumnEnabled: false,
      mobileColumnCount: 4,
      ngWords: ["spam", "bot"],
      repostHiddenUserIds: ["user_a", "user_b"],
    });
  });

  it("カラムデフォルトを全カラムに適用すると全項目がonApplyColumnDefaultsに渡される", () => {
    const onApplyColumnDefaults = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={distinctGlobalSettings}
        onApplyColumnDefaults={onApplyColumnDefaults}
      />,
    );
    openCategory("カラム既定値");
    fireEvent.click(
      screen.getByRole("button", { name: "既存の全カラムに適用" }),
    );
    expect(onApplyColumnDefaults).toHaveBeenCalledTimes(1);
    expect(onApplyColumnDefaults).toHaveBeenCalledWith({
      autoReloadEnabled: false,
      autoReloadInterval: 123,
      showCountdown: false,
      hideHeaderEnabled: false,
      hideTweetInputEnabled: false,
      showCustomMenu: true,
      scrollPosRestoreEnabled: true,
      customCSS: ".test{}",
      smallImageEnabled: true,
      smallImageWidth: "70%",
      blurImageEnabled: true,
      blurImageAmount: "20px",
    });
  });

  it("既存の全カラムに適用ボタンはカスタムCSSセクションの中に無い", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("カラム既定値");
    const cssSection = screen
      .getByRole("heading", { level: 3, name: "カスタム CSS" })
      .closest("section") as HTMLElement;
    expect(
      within(cssSection).queryByRole("button", {
        name: "既存の全カラムに適用",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "既存の全カラムに適用" }),
    ).toBeInTheDocument();
  });
});

describe("AppSettingsPanel 削除保留データフォルダの再実行", () => {
  it("再実行対象が無いときは再実行の操作が表示されない", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={0}
      />,
    );
    openCategory("メンテナンス");
    expect(
      screen.queryByRole("button", { name: "データフォルダの削除を再実行" }),
    ).not.toBeInTheDocument();
  });

  it("再実行対象があるときは件数と再実行の操作が表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={1}
      />,
    );
    openCategory("メンテナンス");
    expect(screen.getByText(/1件/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "データフォルダの削除を再実行" }),
    ).toBeInTheDocument();
  });

  it("再実行して全件成功すると成功メッセージが表示される", async () => {
    const onRetryDataDirectoryDeletion = vi
      .fn()
      .mockResolvedValue({ remaining: 0 });
    render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={1}
        onRetryDataDirectoryDeletion={onRetryDataDirectoryDeletion}
      />,
    );
    openCategory("メンテナンス");
    fireEvent.click(
      screen.getByRole("button", { name: "データフォルダの削除を再実行" }),
    );
    expect(onRetryDataDirectoryDeletion).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("データフォルダを削除しました"),
    ).toBeInTheDocument();
  });

  it("再実行して一部失敗すると残数の失敗メッセージが表示される", async () => {
    const onRetryDataDirectoryDeletion = vi
      .fn()
      .mockResolvedValue({ remaining: 1 });
    render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={2}
        onRetryDataDirectoryDeletion={onRetryDataDirectoryDeletion}
      />,
    );
    openCategory("メンテナンス");
    fireEvent.click(
      screen.getByRole("button", { name: "データフォルダの削除を再実行" }),
    );
    expect(
      await screen.findByText("1件のデータフォルダを削除できませんでした"),
    ).toBeInTheDocument();
  });

  it("「適用」で送られるpatchにpendingDataDirectoryDeletionsは含まれない（保存で巻き戻らないことの回帰確認）", () => {
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={1}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const patch = onApply.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("pendingDataDirectoryDeletions");
  });
});

describe("AppSettingsPanel カラム既定値の写真閲覧後スクロール位置復元と画像縮小の連動", () => {
  const label = "写真閲覧後のスクロール位置を復元する";
  const renderWith = (overrides: Partial<GlobalSettings>) => {
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={{ ...baseGlobalSettings, ...overrides }}
        onApply={onApply}
      />,
    );
    openCategory("カラム既定値");
    return onApply;
  };
  const toggleSmallImage = () =>
    screen.getByRole("checkbox", { name: "画像を縮小表示する" });

  it("画像を縮小表示するがONのとき写真閲覧後のスクロール位置を復元する設定が表示される", () => {
    renderWith({ smallImageEnabled: true });
    expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
  });

  it("画像を縮小表示するがOFFのとき写真閲覧後のスクロール位置を復元する設定は表示されない", () => {
    renderWith({ smallImageEnabled: false });
    expect(
      screen.queryByRole("checkbox", { name: label }),
    ).not.toBeInTheDocument();
  });

  it("画像を縮小表示するをOFFにすると写真閲覧後のスクロール位置を復元する設定もOFFになる", () => {
    const onApply = renderWith({
      smallImageEnabled: true,
      defaultScrollPosRestoreEnabled: true,
    });
    fireEvent.click(toggleSmallImage());
    expect(
      screen.queryByRole("checkbox", { name: label }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        smallImageEnabled: false,
        defaultScrollPosRestoreEnabled: false,
      }),
    );
  });

  it("画像を縮小表示するをOFFにしてから再度ONにしても復元設定はOFFのままである", () => {
    const onApply = renderWith({
      smallImageEnabled: true,
      defaultScrollPosRestoreEnabled: true,
    });
    fireEvent.click(toggleSmallImage());
    fireEvent.click(toggleSmallImage());
    expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        smallImageEnabled: true,
        defaultScrollPosRestoreEnabled: false,
      }),
    );
  });

  it("画像を縮小表示するをOFFにしても復元設定がもともとOFFならOFFのままである", () => {
    const onApply = renderWith({
      smallImageEnabled: true,
      defaultScrollPosRestoreEnabled: false,
    });
    fireEvent.click(toggleSmallImage());
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        smallImageEnabled: false,
        defaultScrollPosRestoreEnabled: false,
      }),
    );
  });
});

describe("AppSettingsPanel バックアップカテゴリ", () => {
  it("デスクトップでもバックアップカテゴリが表示され、開くと作成と復元の操作が出る", () => {
    mockStoreState.isMobile = false;
    render(<AppSettingsPanel {...defaultProps} />);

    openCategory("バックアップ");

    expect(
      screen.getByRole("button", { name: "バックアップを書き出す" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "バックアップファイルを選択" }),
    ).toBeInTheDocument();
  });

  it("isMobile=true（Android）でもバックアップカテゴリが一覧に表示される", () => {
    mockStoreState.isMobile = true;
    render(<AppSettingsPanel {...defaultProps} />);

    expect(categoryItem("バックアップ")).toBeInTheDocument();
  });
});

describe("AppSettingsPanel Linux向け動画再生設定", () => {
  const h264Base = {
    downloadApplicable: true,
    h264Available: false,
    downloadState: "idle" as const,
    downloadError: null,
    relaunchError: null,
    onEnable: vi.fn(),
    onRelaunch: vi.fn(),
  };

  beforeEach(() => {
    h264Base.onEnable = vi.fn();
    h264Base.onRelaunch = vi.fn();
  });

  it("案内を拒否した後でもアプリ設定画面からh264を有効化できる", () => {
    const settings = {
      ...baseGlobalSettings,
      h264DownloadPromptDismissed: true,
    };
    const { rerender } = render(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        isLinux
        h264Setup={h264Base}
      />,
    );
    openCategory("メディア");
    fireEvent.click(screen.getByRole("button", { name: "H.264 を有効化" }));
    expect(h264Base.onEnable).toHaveBeenCalledTimes(1);

    rerender(
      <AppSettingsPanel
        {...defaultProps}
        settings={settings}
        isLinux
        h264Setup={{ ...h264Base, downloadState: "downloading" }}
      />,
    );
    expect(screen.getByText("ダウンロード中…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "H.264 を有効化" }),
    ).toBeDisabled();
  });

  it("h264が取得済みのときアプリ設定画面には有効化済みと表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={{ ...h264Base, h264Available: true }}
      />,
    );
    openCategory("メディア");
    expect(screen.getByText("H.264: 有効化済み")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "H.264 を有効化" }),
    ).not.toBeInTheDocument();
  });

  it("deb版ではアプリ設定画面にh264の項目は表示されずハードウェアデコードの項目は表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={{ ...h264Base, downloadApplicable: false }}
      />,
    );
    openCategory("メディア");
    expect(screen.queryByText(/H\.264/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "ハードウェアデコードを使う（VA-API）",
      }),
    ).toBeInTheDocument();
  });

  it("linux以外のデスクトップではアプリ設定画面にh264とハードウェアデコードの項目が表示されない", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux={false}
        h264Setup={h264Base}
      />,
    );
    openCategory("メディア");
    expect(screen.queryByText(/H\.264/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: "ハードウェアデコードを使う（VA-API）",
      }),
    ).not.toBeInTheDocument();
  });

  it("モバイルではLinux向け動画再生設定が表示されない", () => {
    mockStoreState.isMobile = true;
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("メディア");
    expect(
      screen.queryByRole("checkbox", {
        name: "ハードウェアデコードを使う（VA-API）",
      }),
    ).not.toBeInTheDocument();
  });

  it("ハードウェアデコード設定を切り替えると再起動が必要である旨が表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        startupHardwareVideoDecodeEnabled
      />,
    );
    openCategory("メディア");
    expect(
      screen.queryByText("再起動後に反映されます"),
    ).not.toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox", {
      name: "ハードウェアデコードを使う（VA-API）",
    });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(screen.getByText("再起動後に反映されます")).toBeInTheDocument();

    // 起動時の値へ戻すと案内は消える
    fireEvent.click(checkbox);
    expect(
      screen.queryByText("再起動後に反映されます"),
    ).not.toBeInTheDocument();
  });

  it("保存済みの設定が起動時の値と異なるときは開いた直後から再起動の案内が表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={{ ...baseGlobalSettings, hardwareVideoDecodeEnabled: false }}
        isLinux
        startupHardwareVideoDecodeEnabled
      />,
    );
    openCategory("メディア");
    expect(screen.getByText("再起動後に反映されます")).toBeInTheDocument();
  });

  it("ハードウェアデコードを切り替えて適用するとパッチに反映されh264の拒否状態は含まれない", () => {
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        isLinux
        startupHardwareVideoDecodeEnabled
      />,
    );
    openCategory("メディア");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "ハードウェアデコードを使う（VA-API）",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ hardwareVideoDecodeEnabled: false }),
    );
    expect(onApply.mock.calls[0][0]).not.toHaveProperty(
      "h264DownloadPromptDismissed",
    );
  });

  it("h264の取得に成功すると再起動の案内と今すぐ再起動ボタンが表示され押すと再起動される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={{
          ...h264Base,
          h264Available: true,
          downloadState: "success",
        }}
      />,
    );
    openCategory("メディア");
    expect(screen.getByText(/再起動後に反映されます/)).toBeInTheDocument();
    expect(screen.queryByText("H.264: 有効化済み")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "今すぐ再起動" }));
    expect(h264Base.onRelaunch).toHaveBeenCalledTimes(1);
  });

  it("設定画面で再起動に失敗すると再起動ボタンの近くにエラーが表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={{
          ...h264Base,
          h264Available: true,
          downloadState: "success",
          relaunchError: {
            code: "relaunch.appImageMissing",
            detail: "/opt/app.AppImage",
          },
        }}
      />,
    );
    openCategory("メディア");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("AppImage が見つからない");
    expect(alert).toHaveTextContent("/opt/app.AppImage");
    const relaunch = screen.getByRole("button", { name: "今すぐ再起動" });
    expect(relaunch).toBeEnabled();
    fireEvent.click(relaunch);
    expect(h264Base.onRelaunch).toHaveBeenCalledTimes(1);
  });

  it("再起動に失敗していないときは設定画面にエラーが表示されない", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={{
          ...h264Base,
          h264Available: true,
          downloadState: "success",
        }}
      />,
    );
    openCategory("メディア");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("h264の取得に失敗するとエラー文が表示され再試行できる", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={{
          ...h264Base,
          downloadState: "error",
          downloadError: "ネットワークに接続できません",
        }}
      />,
    );
    openCategory("メディア");
    expect(
      screen.getByText("ネットワークに接続できません"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(h264Base.onEnable).toHaveBeenCalledTimes(1);
  });

  it("h264の取得失敗がAppErrorのとき表示言語に応じた文言になり言語切替に追従する", async () => {
    const { container } = render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={{
          ...h264Base,
          downloadState: "error",
          downloadError: { code: "h264.unsupportedArch", detail: "aarch64" },
        }}
      />,
    );
    openCategory("メディア");
    expect(
      screen.getByText(
        "この環境（aarch64）には対応していません。H.264 コーデックの自動取得は x86_64 のみ対応です",
      ),
    ).toBeInTheDocument();

    await act(() => i18n.changeLanguage("en"));
    try {
      expect(
        screen.getByText(
          "This environment (aarch64) is not supported. Automatic H.264 codec download is only available on x86_64",
        ),
      ).toBeInTheDocument();
      const alert = container.querySelector('[role="alert"]');
      expectNoJapanese(alert as HTMLElement);
    } finally {
      await act(() => i18n.changeLanguage("ja"));
    }
  });
});

/** 表示中のカテゴリのセクション見出し（デスクトップのページ見出しは除く） */
const sectionHeadings = () => {
  if (mockStoreState.isMobile) {
    return screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent ?? "");
  }
  return within(screen.getByRole("region"))
    .getAllByRole("heading", { level: 3 })
    .slice(1)
    .map((h) => h.textContent ?? "");
};

const navButtonLabels = (list: HTMLElement) =>
  within(list)
    .getAllByRole("button")
    .map((b) => b.querySelector("span")?.textContent ?? "");

describe("AppSettingsPanel カテゴリ構成", () => {
  it("デスクトップのアプリ設定ではサイドナビにカテゴリが分類ごとに並ぶ", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    const nav = within(screen.getByRole("navigation"));
    expect(
      nav.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["一般", "カラム", "データ・拡張", "アプリ"]);
    expect(nav.getAllByRole("list").map((l) => navButtonLabels(l))).toEqual([
      ["表示", "閲覧・フィルタ", "メディア", "カラム既定値"],
      ["カラム配置", "プリセット"],
      ["拡張機能", "バックアップ"],
      ["メンテナンス", "このアプリについて"],
    ]);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("モバイルのアプリ設定ではAndroid専用が表示されプリセットと拡張機能が表示されない", () => {
    mockStoreState.isMobile = true;
    render(<AppSettingsPanel {...defaultProps} />);
    const lists = screen.getAllByRole("list");
    expect(
      within(lists[0]).getByRole("button", { name: /^Android専用/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^プリセット/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^拡張機能/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["macOS", "macos"],
    ["Linux", "linux"],
  ])(
    "Windows以外のデスクトップ（%s）では拡張機能カテゴリが表示されない",
    (_os, platformName) => {
      mockPlatform.mockReturnValue(platformName);
      render(<AppSettingsPanel {...defaultProps} />);
      const nav = within(screen.getByRole("navigation"));
      expect(
        nav.queryByRole("button", { name: /^拡張機能/ }),
      ).not.toBeInTheDocument();
      const dataGroup = nav.getAllByRole("list")[2];
      expect(navButtonLabels(dataGroup)).toEqual(["バックアップ"]);
    },
  );

  it("表示カテゴリに表示言語・テーマと表示サイズ・API残量モニターが含まれる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("表示");
    expect(screen.getByRole("group", { name: "表示言語" })).toBeInTheDocument();
    expect(sectionHeadings()).toEqual([
      "テーマと表示サイズ",
      "API残量モニター",
    ]);
  });

  it("閲覧・フィルタカテゴリの先頭にX公式設定が表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    const headings = sectionHeadings();
    expect(headings).toHaveLength(5);
    expect(headings[0]).toBe("X公式設定");
    expect(headings[1]).toContain("グローバルNGワード");
    expect(headings[2]).toContain("リポストを非表示にするユーザー");
    expect(headings[3]).toBe("広告");
    expect(headings[4]).toBe("Grok");
    expect(headings.join()).not.toContain("API残量モニター");
  });

  it("デスクトップのメディアカテゴリに動画とポップアップウィンドウが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("メディア");
    expect(sectionHeadings()).toEqual(["動画", "ポップアップウィンドウ"]);
  });

  it("Linuxデスクトップのメディアカテゴリには動画再生(Linux)も表示される", () => {
    mockPlatform.mockReturnValue("linux");
    render(<AppSettingsPanel {...defaultProps} isLinux />);
    openCategory("メディア");
    expect(sectionHeadings()).toEqual([
      "動画",
      "ポップアップウィンドウ",
      "動画再生（Linux）",
    ]);
  });

  it("Androidの設定画面に画像・動画のポップアップ設定が注意書き付きで表示される", () => {
    mockStoreState.isMobile = true;
    render(<AppSettingsPanel {...defaultProps} isLinux />);
    openCategory("メディア");
    expect(sectionHeadings()).toEqual(["動画", "ポップアップウィンドウ"]);
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
    expect(
      screen.getByText(/複数カラム表示中のみ有効です/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Escキーで閉じる" }),
    ).not.toBeInTheDocument();
  });

  it("デスクトップの設定画面には注意書きが表示されない", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("メディア");
    expect(
      screen.getByRole("checkbox", { name: "Escキーで閉じる" }),
    ).toBeInTheDocument();
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
    expect(
      screen.queryByText(/複数カラム表示中のみ有効です/),
    ).not.toBeInTheDocument();
  });

  it("Androidで画像のポップアップ設定をOFFにして適用するとpatchに反映される", () => {
    mockStoreState.isMobile = true;
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("メディア");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "画像をポップアップウィンドウで開く",
      }),
    );
    fireEvent.click(footer().getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ imagePopupEnabled: false }),
    );
  });

  it("カラム既定値カテゴリの見出しがカラム設定のセクション名と同じになる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("カラム既定値");
    expect(sectionHeadings()).toEqual([
      "自動更新",
      "表示",
      "画像",
      "画像ブラー",
      "カスタム CSS",
    ]);
    expect(screen.queryByText(/カラムデフォルト - /)).not.toBeInTheDocument();
  });

  it("既存の全カラムに適用ボタンがカラム既定値カテゴリの上部に対象を明記して表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("カラム既定値");
    const button = screen.getByRole("button", { name: "既存の全カラムに適用" });
    const firstHeading = screen.getByRole("heading", {
      level: 3,
      name: "自動更新",
    });
    expect(
      button.compareDocumentPosition(firstHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(/自動更新・表示・画像・画像ブラー・カスタム CSS/),
    ).toBeInTheDocument();
    const cssSection = screen
      .getByRole("heading", { level: 3, name: "カスタム CSS" })
      .closest("section") as HTMLElement;
    expect(
      within(cssSection).queryByRole("button", {
        name: "既存の全カラムに適用",
      }),
    ).not.toBeInTheDocument();
  });

  it("既存の全カラムに適用を押すと編集中の既定値がすべて既存カラムに適用される", () => {
    const onApplyColumnDefaults = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApplyColumnDefaults={onApplyColumnDefaults}
      />,
    );
    openCategory("カラム既定値");
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "更新間隔（秒）" }),
      {
        target: { value: "120" },
      },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "カスタム CSS" }), {
      target: { value: ".edited{}" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "既存の全カラムに適用" }),
    );
    expect(onApplyColumnDefaults).toHaveBeenCalledTimes(1);
    expect(onApplyColumnDefaults).toHaveBeenCalledWith({
      autoReloadEnabled: true,
      autoReloadInterval: 120,
      showCountdown: true,
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
      showCustomMenu: false,
      scrollPosRestoreEnabled: false,
      customCSS: ".edited{}",
      smallImageEnabled: false,
      smallImageWidth: "50%",
      blurImageEnabled: false,
      blurImageAmount: "10px",
    });
  });

  it("メンテナンスカテゴリにWebView再生成が表示されバージョン情報と公式設定は表示されない", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={0}
      />,
    );
    openCategory("メンテナンス");
    expect(sectionHeadings()).toEqual(["WebView"]);
    expect(
      screen.queryByRole("heading", { name: "アプリ情報" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "X公式設定" }),
    ).not.toBeInTheDocument();
  });

  it("削除できなかったデータフォルダがあるときメンテナンスカテゴリにデータフォルダの削除が表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={2}
      />,
    );
    openCategory("メンテナンス");
    expect(sectionHeadings()).toEqual(["WebView", "データフォルダの削除"]);
    expect(
      screen.getByText("削除できなかったデータフォルダが2件あります"),
    ).toBeInTheDocument();
  });

  it("このアプリについてカテゴリに現在のバージョンと更新を確認が表示される", () => {
    render(<AppSettingsPanel {...defaultProps} appVersion="1.18.0" />);
    openCategory("このアプリについて");
    expect(screen.getByText("現在のバージョン: 1.18.0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "更新を確認" }),
    ).toBeInTheDocument();
  });

  it("このアプリについてで更新を確認すると結果が同じカテゴリに表示される", () => {
    const scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    try {
      const { rerender } = render(<AppSettingsPanel {...defaultProps} />);
      openCategory("このアプリについて");
      rerender(
        <AppSettingsPanel {...defaultProps} updateManualResult="none" />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "最新のバージョンです",
      );
      expect(
        screen.getByRole("heading", { level: 3, name: "アプリ情報" }),
      ).toBeInTheDocument();
    } finally {
      scrollSpy.mockRestore();
    }
  });

  it("モバイルで非表示のEscキー設定値も適用時のpatchに保存内容のまま含まれる", () => {
    mockStoreState.isMobile = true;
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={{
          ...baseGlobalSettings,
          popupEscCloseEnabled: false,
          imagePopupEnabled: false,
          videoPopupEnabled: false,
        }}
        onApply={onApply}
      />,
    );
    openCategory("メディア");
    fireEvent.click(footer().getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        popupEscCloseEnabled: false,
        imagePopupEnabled: false,
        videoPopupEnabled: false,
      }),
    );
  });
});

const テーマをライトに変更する = () => {
  fireEvent.click(screen.getByRole("checkbox", { name: "テーマを変更する" }));
  fireEvent.click(screen.getByRole("button", { name: "ライト" }));
};

describe("AppSettingsPanel 切り替えと初期表示", () => {
  it("デスクトップでアプリ設定を開くと毎回表示カテゴリが選ばれている", () => {
    const first = render(<AppSettingsPanel {...defaultProps} />);
    openCategory("バックアップ");
    expect(categoryItem("バックアップ")).toHaveAttribute(
      "aria-current",
      "page",
    );
    first.unmount();

    render(<AppSettingsPanel {...defaultProps} />);
    expect(categoryItem("表示")).toHaveAttribute("aria-current", "page");
    expect(categoryItem("バックアップ")).not.toHaveAttribute("aria-current");
  });

  it("サイドナビでカテゴリを選ぶとそのカテゴリのページに切り替わる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("checkbox", { name: "テーマを変更する" }),
    ).toBeInTheDocument();

    openCategory("メディア");

    expect(
      screen.getByRole("checkbox", { name: "動画の自動再生を停止する" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "テーマを変更する" }),
    ).not.toBeInTheDocument();
    expect(categoryItem("メディア")).toHaveAttribute("aria-current", "page");
    expect(categoryItem("表示")).not.toHaveAttribute("aria-current");
  });

  it("カテゴリを切り替えても編集中の値は保持される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    テーマをライトに変更する();

    openCategory("メディア");
    openCategory("表示");

    expect(screen.getByRole("button", { name: "ライト" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("サイドナビはキーボードでカテゴリを移動できる", async () => {
    const user = userEvent.setup();
    render(<AppSettingsPanel {...defaultProps} />);
    categoryItem("表示").focus();

    await user.keyboard("{ArrowDown}");

    expect(categoryItem("閲覧・フィルタ")).toHaveFocus();
    expect(categoryItem("閲覧・フィルタ")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "X公式設定" }),
    ).toBeInTheDocument();
  });
});

describe("AppSettingsPanel 適用範囲", () => {
  it.each(["表示", "閲覧・フィルタ", "メディア", "カラム既定値"])(
    "下書き対象のカテゴリ（%s）ではフッターにキャンセルと適用が表示される",
    (category) => {
      render(<AppSettingsPanel {...defaultProps} />);
      openCategory(category);
      expect(
        footer().getByRole("button", { name: "キャンセル" }),
      ).toBeInTheDocument();
      expect(
        footer().getByRole("button", { name: "適用" }),
      ).toBeInTheDocument();
    },
  );

  it.each(["カラム配置", "バックアップ", "メンテナンス", "このアプリについて"])(
    "下書き対象外のカテゴリ（%s）ではフッターに閉じるだけが表示される",
    (category) => {
      render(
        <AppSettingsPanel
          {...defaultProps}
          columns={mockColumns}
          accounts={mockAccounts}
        />,
      );
      openCategory(category);
      expect(
        footer().getByRole("button", { name: "閉じる" }),
      ).toBeInTheDocument();
      expect(footer().getAllByRole("button")).toHaveLength(1);
      expect(
        footer().queryByRole("button", { name: "適用" }),
      ).not.toBeInTheDocument();
    },
  );

  it("複数カテゴリで編集した値は1回の適用でまとめて保存される", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={{ ...baseGlobalSettings, videoAutoPlayStopEnabled: false }}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    テーマをライトに変更する();
    openCategory("メディア");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "動画の自動再生を停止する" }),
    );

    fireEvent.click(footer().getByRole("button", { name: "適用" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "light",
        videoAutoPlayStopEnabled: true,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("未適用の変更があるカテゴリにはサイドナビに印が付く", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(categoryItem("表示")).not.toHaveAccessibleName(/未適用の変更あり/);

    テーマをライトに変更する();

    expect(categoryItem("表示")).toHaveAccessibleName(/未適用の変更あり/);
    expect(categoryItem("メディア")).not.toHaveAccessibleName(
      /未適用の変更あり/,
    );
  });

  it("値を元に戻すと未適用の印が消える", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    テーマをライトに変更する();
    expect(categoryItem("表示")).toHaveAccessibleName(/未適用の変更あり/);

    fireEvent.click(screen.getByRole("button", { name: "ダーク" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "テーマを変更する" }));

    expect(categoryItem("表示")).not.toHaveAccessibleName(/未適用の変更あり/);
  });

  it("キャンセルを押すと編集中の値を破棄してアプリ設定が閉じる", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    テーマをライトに変更する();

    fireEvent.click(footer().getByRole("button", { name: "キャンセル" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("カラム配置カテゴリではページ内の適用で配置が反映される", () => {
    const onApplyLayout = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
        onApplyLayout={onApplyLayout}
        onClose={onClose}
      />,
    );
    openCategory("カラム配置");
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "2" },
    });

    fireEvent.click(
      within(screen.getByRole("region")).getByRole("button", { name: "適用" }),
    );

    expect(onApplyLayout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AppSettingsPanel 入力エラー", () => {
  const ngWordsInput = () =>
    screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
    );
  const repostInput = () =>
    screen.getByRole("textbox", { name: "リポストを非表示にするユーザー" });

  it("別カテゴリにNGワードの入力エラーがあると適用時に閲覧・フィルタへ切り替わる", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    openCategory("閲覧・フィルタ");
    fireEvent.change(ngWordsInput(), { target: { value: "/[[/" } });
    openCategory("表示");

    fireEvent.click(footer().getByRole("button", { name: "適用" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(categoryItem("閲覧・フィルタ")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("正規表現が不正です: /[[/")).toBeInTheDocument();
    expect(categoryItem("閲覧・フィルタ")).toHaveAccessibleName(
      /入力エラーあり/,
    );
  });

  it("リポスト非表示ユーザーの入力エラーでも閲覧・フィルタへ切り替わる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    fireEvent.change(repostInput(), { target: { value: "bad-id!" } });
    openCategory("メディア");

    fireEvent.click(footer().getByRole("button", { name: "適用" }));

    expect(categoryItem("閲覧・フィルタ")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByText(/`bad-id!` はXのユーザーIDとして正しくありません/),
    ).toBeInTheDocument();
  });

  it("入力エラーを直して適用するとエラーの印が消えて保存される", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    openCategory("閲覧・フィルタ");
    fireEvent.change(ngWordsInput(), { target: { value: "/[[/" } });
    fireEvent.click(footer().getByRole("button", { name: "適用" }));
    expect(categoryItem("閲覧・フィルタ")).toHaveAccessibleName(
      /入力エラーあり/,
    );

    fireEvent.change(ngWordsInput(), { target: { value: "spam" } });
    fireEvent.click(footer().getByRole("button", { name: "適用" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam"] }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AppSettingsPanel Androidの2階層", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("モバイルでアプリ設定を開くとカテゴリ一覧が表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["一般", "カラム", "データ・拡張", "アプリ"]);
    expect(categoryItem("メディア")).toHaveAccessibleName(
      /動画・ポップアップウィンドウ/,
    );
    expect(categoryItem("表示")).toHaveAccessibleName(
      /言語・テーマ・表示サイズ・API残量モニター/,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("モバイルでカテゴリを選ぶと詳細画面に切り替わり戻るで一覧に戻れる", () => {
    render(<AppSettingsPanel {...defaultProps} />);

    openCategory("メディア");

    expect(
      screen.getByRole("heading", { level: 2, name: "メディア" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "戻る" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "動画の自動再生を停止する" }),
    ).toBeInTheDocument();

    backToList();

    expect(
      screen.getByRole("heading", { level: 2, name: "アプリ設定" }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("モバイルのカテゴリ一覧で未適用の変更があるときは一覧にも印と適用が表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      footer().queryByRole("button", { name: "適用" }),
    ).not.toBeInTheDocument();

    openCategory("表示");
    テーマをライトに変更する();
    backToList();

    expect(categoryItem("表示")).toHaveAccessibleName(/未適用の変更あり/);
    expect(
      footer().getByRole("button", { name: "キャンセル" }),
    ).toBeInTheDocument();
    expect(footer().getByRole("button", { name: "適用" })).toBeInTheDocument();
  });

  it("モバイルで入力エラーがあると閲覧・フィルタの詳細画面に切り替わる", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("閲覧・フィルタ");
    fireEvent.change(
      screen.getByPlaceholderText(
        "1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）",
      ),
      { target: { value: "/[[/" } },
    );
    backToList();

    fireEvent.click(footer().getByRole("button", { name: "適用" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 2, name: "閲覧・フィルタ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("正規表現が不正です: /[[/")).toBeInTheDocument();
  });
});

describe("AppSettingsPanel Androidの戻る操作", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("モバイルで詳細画面を表示中に端末の戻る操作をするとカテゴリ一覧に戻る", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    openCategory("メディア");
    expect(
      screen.getByRole("heading", { level: 2, name: "メディア" }),
    ).toBeInTheDocument();

    let handled = false;
    act(() => {
      handled = handleAndroidBack();
    });

    expect(handled).toBe(true);
    expect(
      screen.getByRole("heading", { level: 2, name: "アプリ設定" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("モバイルで詳細画面から戻っても編集中の値は保持される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("表示");
    テーマをライトに変更する();

    act(() => {
      handleAndroidBack();
    });

    expect(categoryItem("表示")).toHaveAccessibleName(/未適用の変更あり/);
  });

  it("モバイルでカテゴリ一覧を表示中に端末の戻る操作をするとアプリ設定が閉じる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);

    let handled = false;
    act(() => {
      handled = handleAndroidBack();
    });

    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("詳細画面から一覧に戻った後にもう一度戻る操作をするとアプリ設定が閉じる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    openCategory("メディア");
    act(() => {
      handleAndroidBack();
    });
    expect(onClose).not.toHaveBeenCalled();

    let handled = false;
    act(() => {
      handled = handleAndroidBack();
    });

    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("モバイルで未適用の変更があるときの一覧での戻る操作は確認メッセージを表示して閉じない", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    openCategory("表示");
    テーマをライトに変更する();
    act(() => {
      handleAndroidBack(); // 詳細 → 一覧
    });

    let handled = false;
    act(() => {
      handled = handleAndroidBack();
    });

    expect(handled).toBe(true);
    expect(
      screen.getByRole("dialog", { name: "未適用の変更があります" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("アプリ設定を閉じた後の戻る操作は画面側では処理されない", () => {
    const { unmount } = render(<AppSettingsPanel {...defaultProps} />);
    openCategory("メディア");
    unmount();

    expect(handleAndroidBack()).toBe(false);
  });

  it("デスクトップでも戻る操作ではEscと同じくアプリ設定が閉じる（戻る操作の入口はAndroidのみなので害はない）", () => {
    mockStoreState.isMobile = false;
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);

    let handled = false;
    act(() => {
      handled = handleAndroidBack();
    });

    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AppSettingsPanel 拡張機能カテゴリ", () => {
  it("Windowsでは設定画面に拡張機能の管理が表示される", async () => {
    render(<AppSettingsPanel {...defaultProps} />);

    openCategory("拡張機能");

    expect(
      await screen.findByRole("button", { name: "フォルダを指定して追加" }),
    ).toBeInTheDocument();
    expect(extensionsService.listExtensions).toHaveBeenCalled();
  });

  it.each([
    ["Linux", "linux", false],
    ["macOS", "macos", false],
    ["Android（モバイル）", "android", true],
    ["Windowsのモバイル扱い", "windows", true],
  ])(
    "Windows以外とモバイルでは拡張機能の管理が表示されない（%s）",
    (_name, platformName, isMobile) => {
      mockPlatform.mockReturnValue(platformName);
      mockStoreState.isMobile = isMobile;

      render(<AppSettingsPanel {...defaultProps} />);

      const scope = isMobile ? screen : within(screen.getByRole("navigation"));
      expect(
        scope.queryByRole("button", { name: /^拡張機能/ }),
      ).not.toBeInTheDocument();
      expect(categoryItem("バックアップ")).toBeInTheDocument();
    },
  );

  it("拡張機能カテゴリの変更成功がonExtensionsChangedで通知される", async () => {
    const onExtensionsChanged = vi.fn();
    vi.mocked(extensionsService.pickExtensionFolder).mockResolvedValue(
      "C:/ext",
    );
    vi.mocked(extensionsService.addExtensionFromFolder).mockResolvedValue(
      {} as never,
    );
    render(
      <AppSettingsPanel
        {...defaultProps}
        onExtensionsChanged={onExtensionsChanged}
      />,
    );
    openCategory("拡張機能");

    fireEvent.click(
      await screen.findByRole("button", { name: "フォルダを指定して追加" }),
    );

    await waitFor(() => expect(onExtensionsChanged).toHaveBeenCalledTimes(1));
  });
});

describe("AppSettingsPanel 表示言語", () => {
  const getLanguageGroup = (name: string) =>
    screen.getByRole("group", { name });

  it("設定画面の言語選択肢は自動・日本語・Englishの3つである", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    const buttons = within(getLanguageGroup("表示言語")).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "自動",
      "日本語",
      "English",
    ]);
  });

  it("英語表示でも日本語とEnglishはそれぞれの言語の表記で表示される", async () => {
    await i18n.changeLanguage("en");
    render(<AppSettingsPanel {...defaultProps} />);
    const buttons = within(getLanguageGroup("Language")).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Auto",
      "日本語",
      "English",
    ]);
  });

  it("Englishを選んで適用するとonApplyに渡るパッチの言語がenになる", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    fireEvent.click(
      within(getLanguageGroup("表示言語")).getByRole("button", {
        name: "English",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en" }),
    );
  });

  it("言語を変更しなければ現在の言語設定がそのままパッチに渡る", () => {
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={{ ...baseGlobalSettings, language: "ja" }}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ language: "ja" }),
    );
  });
});

/** 言語選択肢の「日本語」は各言語の自国語表記で出すため、検査対象から外して日本語が残っていないか確認する */
function expectNoJapaneseOutsideLanguagePicker() {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelector('[role="group"][aria-label="Language"]')?.remove();
  expectNoJapanese(clone);
}

describe("AppSettingsPanel 英語表示", () => {
  const englishAccount: Account = {
    id: "acc-en",
    label: "Main",
    dataDirectory: "/data-en",
    color: "#1d9bf0",
    createdAt: "2026-05-03T00:00:00Z",
  };
  const layoutColumns: Column[] = [
    {
      ...mockColumns[0],
      id: "e1",
      accountId: "acc-en",
      gridRow: 1,
      gridCol: 1,
      heightMode: "fixed",
      heightValue: 300,
      heightUnit: "px",
      order: 0,
    },
    {
      ...mockColumns[0],
      id: "e2",
      accountId: "acc-en",
      pageType: "notifications",
      gridRow: 0,
      gridCol: 0,
      order: 1,
    },
  ];
  const h264Idle = {
    downloadApplicable: true,
    h264Available: false,
    downloadState: "idle" as const,
    downloadError: null,
    relaunchError: null,
    onEnable: vi.fn(),
    onRelaunch: vi.fn(),
  };

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("表示言語が英語のとき Grok ボタンの非表示スイッチと閲覧・フィルタの説明が英語で表示される", () => {
    mockStoreState.isMobile = true;
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByText(
        "X settings, muted words, hidden reposts, ads and the Grok button",
      ),
    ).toBeInTheDocument();

    openCategory("Browsing & filters");

    expect(
      screen.getByRole("heading", { level: 3, name: "Grok" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Hide the Grok button on posts" }),
    ).not.toBeChecked();
  });

  it("表示言語が英語のとき各カテゴリに日本語の文言が表示されない", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AppSettingsPanel
        {...defaultProps}
        accounts={[englishAccount]}
        pendingDataDirectoryDeletionCount={2}
        updateManualResult="error"
        isLinux
        h264Setup={h264Idle}
        settings={{ ...baseGlobalSettings, hardwareVideoDecodeEnabled: false }}
        startupHardwareVideoDecodeEnabled
      />,
    );
    openCategory("Browsing & filters");
    await user.click(
      screen.getByRole("button", { name: "How to write muted words" }),
    );
    expectNoJapaneseOutsideLanguagePicker();
    expect(screen.getByText("Global muted words")).toBeInTheDocument();
    openCategory("Media");
    await user.click(screen.getByRole("checkbox", { name: /VA-API/ }));
    expectNoJapaneseOutsideLanguagePicker();
    openCategory("Display");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Change the app UI display size",
      }),
    );
    expectNoJapaneseOutsideLanguagePicker();
    expect(screen.getByText("App settings")).toBeInTheDocument();
    for (const category of [
      "Column defaults",
      "Maintenance",
      "About",
      "Backup",
    ]) {
      openCategory(category);
      expectNoJapaneseOutsideLanguagePicker();
    }

    // 状態の違う文言も確認する
    for (const props of [
      { updateManualResult: "none" as const, updateChecking: true },
      { pendingDataDirectoryDeletionCount: 1 },
    ]) {
      rerender(
        <AppSettingsPanel
          {...defaultProps}
          accounts={[englishAccount]}
          isLinux
          h264Setup={{ ...h264Idle, downloadState: "success" }}
          {...props}
        />,
      );
      for (const category of ["Maintenance", "About"]) {
        openCategory(category);
        expectNoJapaneseOutsideLanguagePicker();
      }
    }
    for (const h264 of [
      { ...h264Idle, downloadState: "downloading" as const },
      { ...h264Idle, downloadState: "error" as const },
      { ...h264Idle, h264Available: true },
    ]) {
      rerender(<AppSettingsPanel {...defaultProps} isLinux h264Setup={h264} />);
      openCategory("Media");
      expectNoJapaneseOutsideLanguagePicker();
    }
  });

  it("表示言語が英語のとき削除保留データフォルダの件数が単数形と複数形で表示される", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue({ remaining: 1 });
    const { rerender } = render(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={1}
        onRetryDataDirectoryDeletion={onRetry}
      />,
    );
    openCategory("Maintenance");
    expect(
      screen.getByText("1 data folder could not be deleted"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Retry deleting data folders" }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByText("1 data folder could not be deleted"),
      ).toHaveLength(2),
    );
    rerender(
      <AppSettingsPanel
        {...defaultProps}
        pendingDataDirectoryDeletionCount={3}
        onRetryDataDirectoryDeletion={onRetry}
      />,
    );
    expect(
      screen.getByText("3 data folders could not be deleted"),
    ).toBeInTheDocument();
  });

  it("表示言語が英語のときモバイルのカテゴリ一覧と詳細に日本語の文言が表示されない", async () => {
    mockStoreState.isMobile = true;
    render(
      <AppSettingsPanel
        {...defaultProps}
        accounts={[englishAccount]}
        columns={layoutColumns}
      />,
    );
    expect(screen.getByText("Android")).toBeInTheDocument();
    expectNoJapaneseOutsideLanguagePicker();
    openCategory("Android");
    expectNoJapaneseOutsideLanguagePicker();
    backToList();
    openCategory("Column layout");
    expect(screen.getByText("Display order")).toBeInTheDocument();
    expectNoJapaneseOutsideLanguagePicker();
  });

  it("表示言語が英語のときカラム配置カテゴリに日本語の文言が表示されない", async () => {
    const user = userEvent.setup();
    render(
      <AppSettingsPanel
        {...defaultProps}
        accounts={[englishAccount]}
        columns={layoutColumns}
      />,
    );
    openCategory("Column layout");
    expectNoJapaneseOutsideLanguagePicker();

    // 空きセルを選ぶと配置待ちの案内が出る
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "2" },
    });
    await user.click(screen.getAllByRole("button", { name: "+ Add row" })[0]);
    expect(screen.getByText("← Place here")).toBeInTheDocument();
    expect(
      screen.getByText("Click to place at column 1, row 2"),
    ).toBeInTheDocument();
    expectNoJapaneseOutsideLanguagePicker();

    // 割り当て済みセルを選ぶと高さ設定が出る
    await user.click(
      screen.getByRole("button", { name: "Cell at column 1, row 1" }),
    );
    expect(screen.getByText(/Height settings/)).toBeInTheDocument();
    expectNoJapaneseOutsideLanguagePicker();
  });

  it("表示言語が英語のときプリセットカテゴリに日本語の文言が表示されない", async () => {
    const { rerender } = render(<AppSettingsPanel {...defaultProps} />);
    openCategory("Presets");
    expect(screen.getByText("No saved presets")).toBeInTheDocument();
    expectNoJapaneseOutsideLanguagePicker();

    rerender(
      <AppSettingsPanel
        {...defaultProps}
        settings={{
          ...baseGlobalSettings,
          presets: [{ id: "p1", name: "Work", columns: [] }],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    expectNoJapaneseOutsideLanguagePicker();
  });
});

describe("AppSettingsPanel 表示言語の動的な切り替え", () => {
  it("画面を開いたまま言語を適用すると開いている画面の文言が切り替わる", async () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(screen.getByText("アプリ設定")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "適用" })).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage("en");
    });

    expect(screen.getByText("App settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.queryByText("アプリ設定")).not.toBeInTheDocument();

    // 開いたまま別カテゴリへ移動しても英語のまま
    openCategory("Presets");
    expect(screen.getByText("No saved presets")).toBeInTheDocument();
  });

  it("表示言語が英語のとき入力検証のエラーが英語で表示され日本語を含まない", async () => {
    await i18n.changeLanguage("en");
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    openCategory("Browsing & filters");
    fireEvent.change(
      screen.getByPlaceholderText(
        "One word per line (applies to all columns; /regex/flags is also accepted)",
      ),
      { target: { value: "/[[/" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      screen.getByText("Invalid regular expression: /[[/"),
    ).toBeInTheDocument();
    expectNoJapaneseOutsideLanguagePicker();

    fireEvent.change(
      screen.getByPlaceholderText(
        "One word per line (applies to all columns; /regex/flags is also accepted)",
      ),
      { target: { value: "" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Users whose reposts are hidden" }),
      { target: { value: "bad-id!" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      screen.getByText(
        "`bad-id!` is not a valid X username (1–15 letters, numbers, or underscores)",
      ),
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
describe("AppSettingsPanel デザイン原則（アクセシビリティ）", () => {
  const h264Failed = {
    downloadApplicable: true,
    h264Available: false,
    downloadState: "error" as const,
    downloadError: null,
    relaunchError: null,
    onEnable: vi.fn(),
    onRelaunch: vi.fn(),
  };

  it("見出しがダイアログの名前になり aria-modal が付く", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(screen.getByRole("dialog", { name: "アプリ設定" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("下書き対象の各カテゴリのすべての入力欄とボタンにアクセシブルネームがある", () => {
    const { container } = render(
      <AppSettingsPanel
        {...defaultProps}
        isLinux
        h264Setup={h264Failed}
        pendingDataDirectoryDeletionCount={1}
      />,
    );
    for (const category of [
      "表示",
      "閲覧・フィルタ",
      "メディア",
      "カラム既定値",
      "メンテナンス",
      "このアプリについて",
    ]) {
      openCategory(category);
      expectAccessibleControls(container);
    }
  });

  it("モバイルの一覧と各詳細でもすべての入力欄とボタンにアクセシブルネームがある", () => {
    mockStoreState.isMobile = true;
    const { container } = render(<AppSettingsPanel {...defaultProps} />);
    expectAccessibleControls(container);
    for (const category of [
      "表示",
      "閲覧・フィルタ",
      "メディア",
      "カラム既定値",
      "Android専用",
    ]) {
      openCategory(category);
      expectAccessibleControls(container);
      backToList();
    }
  });

  it("カラム既定値のカスタムCSSとグローバルNGワードの入力欄に名前が付く", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("閲覧・フィルタ");
    expect(
      screen.getByRole("textbox", { name: "グローバルNGワード" }),
    ).toBeInTheDocument();
    openCategory("カラム既定値");
    expect(
      screen.getByRole("textbox", { name: "カスタム CSS" }),
    ).toBeInTheDocument();
  });

  it("選択中のカテゴリだけが現在のページとして示され、切り替えると移る", async () => {
    const user = userEvent.setup();
    render(<AppSettingsPanel {...defaultProps} />);
    const nav = within(screen.getByRole("navigation"));
    const current = () =>
      nav
        .getAllByRole("button")
        .filter((b) => b.getAttribute("aria-current") === "page");
    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveAccessibleName("表示");

    await user.click(categoryItem("カラム配置"));

    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveAccessibleName("カラム配置");
  });

  it("ページ本文は選択中のカテゴリで名前が付き、サイドナビの項目から参照される", async () => {
    const user = userEvent.setup();
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByRole("navigation", { name: "設定のカテゴリ" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region")).toHaveAccessibleName("表示");
    expect(categoryItem("表示").id).not.toBe("");

    await user.click(categoryItem("カラム配置"));

    expect(screen.getByRole("region")).toHaveAccessibleName("カラム配置");
  });

  it("サイドナビの選択中の項目だけがタブ移動の対象になる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(categoryItem("表示")).toHaveAttribute("tabindex", "0");
    expect(categoryItem("閲覧・フィルタ")).toHaveAttribute("tabindex", "-1");
  });

  it("閉じたあと開く前にフォーカスしていた要素へフォーカスが戻る", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<AppSettingsPanel {...defaultProps} />);
    screen.getByRole("button", { name: "キャンセル" }).focus();
    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("閉じるボタンで onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("表示サイズ・テーマの選択肢は選択中の項目だけ押下状態になる", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        settings={{
          ...baseGlobalSettings,
          columnScale: "large",
          theme: "light",
        }}
      />,
    );
    const columnScale = within(
      screen.getByRole("group", { name: "カラム内の表示サイズ" }),
    );
    expect(columnScale.getByRole("button", { name: "大" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(columnScale.getByRole("button", { name: "標準" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const theme = within(screen.getByRole("group", { name: "テーマ" }));
    expect(theme.getByRole("button", { name: "ライト" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(theme.getByRole("button", { name: "ダーク" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("変更チェックボックスがOFFの間は選択肢が無効でクリックしても選択状態が変わらない", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    const group = within(
      screen.getByRole("group", { name: "カラム内の表示サイズ" }),
    );
    const before = group
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-pressed"));
    const target = group.getByRole("button", { name: "大" });
    expect(target).toBeDisabled();

    fireEvent.click(target);

    expect(
      group.getAllByRole("button").map((b) => b.getAttribute("aria-pressed")),
    ).toEqual(before);
  });

  it("更新確認中は更新確認ボタンが無効でクリックしても onCheckUpdate が呼ばれない", () => {
    const onCheckUpdate = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        updateChecking
        onCheckUpdate={onCheckUpdate}
      />,
    );
    openCategory("このアプリについて");
    const button = screen.getByRole("button", { name: "確認中..." });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(onCheckUpdate).not.toHaveBeenCalled();
  });

  describe("状態を色だけで伝えない", () => {
    const markOf = (text: string) =>
      screen
        .getByText(text)
        .querySelector('[aria-hidden="true"][data-kind]') as HTMLElement | null;

    it("更新が最新のときは成功の記号が付く", () => {
      render(<AppSettingsPanel {...defaultProps} updateManualResult="none" />);
      openCategory("このアプリについて");
      expect(markOf("最新のバージョンです")).toHaveAttribute(
        "data-kind",
        "success",
      );
    });

    it("更新確認に失敗したときは警告の記号が付く", () => {
      render(<AppSettingsPanel {...defaultProps} updateManualResult="error" />);
      openCategory("このアプリについて");
      expect(markOf("更新の確認に失敗しました")).toHaveAttribute(
        "data-kind",
        "warning",
      );
    });

    it("データフォルダの削除に成功したときは成功の記号が付く", async () => {
      render(
        <AppSettingsPanel
          {...defaultProps}
          pendingDataDirectoryDeletionCount={1}
        />,
      );
      openCategory("メンテナンス");
      fireEvent.click(
        screen.getByRole("button", { name: "データフォルダの削除を再実行" }),
      );
      await screen.findByText("データフォルダを削除しました");
      expect(markOf("データフォルダを削除しました")).toHaveAttribute(
        "data-kind",
        "success",
      );
    });

    it("データフォルダの削除に一部失敗したときは警告の記号が付く", async () => {
      render(
        <AppSettingsPanel
          {...defaultProps}
          pendingDataDirectoryDeletionCount={2}
          onRetryDataDirectoryDeletion={vi
            .fn()
            .mockResolvedValue({ remaining: 1 })}
        />,
      );
      openCategory("メンテナンス");
      fireEvent.click(
        screen.getByRole("button", { name: "データフォルダの削除を再実行" }),
      );
      await screen.findByText("1件のデータフォルダを削除できませんでした");
      expect(
        markOf("1件のデータフォルダを削除できませんでした"),
      ).toHaveAttribute("data-kind", "warning");
    });

    it("H.264の取得に失敗したときは警告の記号が付く", () => {
      render(
        <AppSettingsPanel {...defaultProps} isLinux h264Setup={h264Failed} />,
      );
      openCategory("メディア");
      const alert = screen.getByRole("alert");
      expect(
        alert.querySelector('[aria-hidden="true"][data-kind="warning"]'),
      ).not.toBeNull();
    });

    it("不正な入力のエラーには警告の記号が付く", () => {
      render(<AppSettingsPanel {...defaultProps} />);
      openCategory("閲覧・フィルタ");
      fireEvent.change(
        screen.getByRole("textbox", {
          name: "リポストを非表示にするユーザー",
        }),
        { target: { value: "bad-id!" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "適用" }));
      const message = screen.getByText(/はXのユーザーIDとして正しくありません/);
      expect(
        message.querySelector('[aria-hidden="true"][data-kind="warning"]'),
      ).not.toBeNull();
    });
  });
});

describe("AppSettingsPanel 更新確認の結果表示", () => {
  let scrollSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    scrollSpy.mockRestore();
  });

  it.each(["none", "error"] as const)(
    "更新確認の結果が表示されると結果の位置までスクロールする（%s）",
    (result) => {
      const { rerender } = render(<AppSettingsPanel {...defaultProps} />);
      openCategory("このアプリについて");
      expect(scrollSpy).not.toHaveBeenCalled();

      rerender(
        <AppSettingsPanel {...defaultProps} updateManualResult={result} />,
      );

      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenCalledWith({ block: "nearest" });
      expect(scrollSpy.mock.contexts[0]).toBe(screen.getByRole("status"));
    },
  );

  it.each([
    ["none" as const, "最新のバージョンです"],
    ["error" as const, "更新の確認に失敗しました"],
  ])(
    "更新確認の結果はスクリーンリーダーに読み上げられる状態で表示される（%s）",
    (result, text) => {
      render(
        <AppSettingsPanel {...defaultProps} updateManualResult={result} />,
      );
      openCategory("このアプリについて");
      expect(screen.getByRole("status")).toHaveTextContent(text);
    },
  );

  it("更新確認の結果が出る前は結果の読み上げ領域もスクロールも無い", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    openCategory("このアプリについて");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("結果が変わらない再描画ではスクロールが呼ばれず上へスクロールしても引き戻されない", () => {
    const { rerender } = render(
      <AppSettingsPanel {...defaultProps} updateManualResult="none" />,
    );
    openCategory("このアプリについて");
    scrollSpy.mockClear();

    rerender(
      <AppSettingsPanel
        {...defaultProps}
        updateManualResult="none"
        updateChecking
        appVersion="0.2.0"
      />,
    );

    expect(scrollSpy).not.toHaveBeenCalled();
  });
});

describe("AppSettingsPanel 未適用の変更があるときの確認メッセージ", () => {
  /** 「表示」カテゴリでテーマをライトに変更する（未適用の変更を作る） */
  const changeThemeToLight = () => {
    fireEvent.click(screen.getByRole("checkbox", { name: "テーマを変更する" }));
    fireEvent.click(screen.getByRole("button", { name: "ライト" }));
  };
  const 確認メッセージ = () =>
    screen.queryByRole("dialog", { name: "未適用の変更があります" });
  const ヘッダーの閉じる = () => screen.getByText("✕");

  it.each([
    [
      "ヘッダーの ✕",
      () => {
        fireEvent.click(ヘッダーの閉じる());
      },
    ],
    [
      "Esc キー",
      () => {
        fireEvent.keyDown(document.activeElement as Element, {
          key: "Escape",
        });
      },
    ],
    [
      "「バックアップ」カテゴリのフッターの「閉じる」",
      () => {
        openCategory("バックアップ");
        fireEvent.click(footer().getByRole("button", { name: "閉じる" }));
      },
    ],
  ])(
    "アプリ設定で未適用の変更があるときに%sで閉じようとすると確認メッセージが表示される",
    (_name, close) => {
      const onClose = vi.fn();
      render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
      changeThemeToLight();

      close();

      const dialog = 確認メッセージ();
      expect(dialog).toBeInTheDocument();
      expect(
        within(dialog as HTMLElement).getByRole("button", {
          name: "破棄して閉じる",
        }),
      ).toBeInTheDocument();
      expect(
        within(dialog as HTMLElement).getByRole("button", { name: "戻る" }),
      ).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("Grok ボタンのスイッチを切り替えて閉じようとすると確認メッセージが表示され閲覧・フィルタに未適用の印が付く", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    openCategory("閲覧・フィルタ");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "ポスト内の Grok ボタンを非表示にする",
      }),
    );
    expect(categoryItem("閲覧・フィルタ")).toHaveAccessibleName(
      /未適用の変更あり/,
    );
    expect(categoryItem("表示")).not.toHaveAccessibleName(/未適用の変更あり/);

    fireEvent.click(ヘッダーの閉じる());

    expect(確認メッセージ()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("アプリ設定の確認メッセージで破棄して閉じるを選ぶと変更を保存せずに閉じる", () => {
    const onClose = vi.fn();
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onClose={onClose}
        onApply={onApply}
      />,
    );
    changeThemeToLight();
    fireEvent.click(ヘッダーの閉じる());

    fireEvent.click(screen.getByRole("button", { name: "破棄して閉じる" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("アプリ設定の確認メッセージで戻るを選ぶと編集中の値を保ったまま設定に戻る", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    changeThemeToLight();
    fireEvent.click(ヘッダーの閉じる());

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));

    expect(確認メッセージ()).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "ライト" }).className).toContain(
      "scaleBtnActive",
    );
    expect(
      within(screen.getByRole("navigation")).getByRole("button", {
        name: /^表示.*未適用/,
      }),
    ).toBeInTheDocument();
  });

  it("確認メッセージの表示中に Esc キーを押すと確認メッセージだけが閉じる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    changeThemeToLight();
    fireEvent.click(ヘッダーの閉じる());
    expect(確認メッセージ()).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    expect(確認メッセージ()).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("確認メッセージの表示中は、アプリ設定本体が受けたEscキーでは何も起きない", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    changeThemeToLight();
    fireEvent.click(ヘッダーの閉じる());
    expect(確認メッセージ()).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "アプリ設定" }), {
      key: "Escape",
    });

    expect(確認メッセージ()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("確認メッセージがネイティブの閉じる要求(cancel)を受けても確認メッセージだけが閉じる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    changeThemeToLight();
    fireEvent.click(ヘッダーの閉じる());

    fireEvent(
      確認メッセージ() as Element,
      new Event("cancel", { cancelable: true }),
    );

    expect(確認メッセージ()).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("アプリ設定で未適用の変更がないときは確認なしで閉じる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);

    fireEvent.click(ヘッダーの閉じる());

    expect(確認メッセージ()).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("アプリ設定で値を元に戻したときは確認なしで閉じる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    changeThemeToLight();
    // テーマを元の「ダーク」に戻し、「テーマを変更する」も外す
    fireEvent.click(screen.getByRole("button", { name: "ダーク" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "テーマを変更する" }));

    fireEvent.click(ヘッダーの閉じる());

    expect(確認メッセージ()).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("アプリ設定でキャンセルを押したときは確認なしで変更を破棄して閉じる", () => {
    const onClose = vi.fn();
    const onApply = vi.fn();
    render(
      <AppSettingsPanel
        {...defaultProps}
        onClose={onClose}
        onApply={onApply}
      />,
    );
    changeThemeToLight();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(確認メッセージ()).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("モバイルのカテゴリ一覧で未適用の変更があるときに ✕ で閉じようとすると確認メッセージが表示される", () => {
    mockStoreState.isMobile = true;
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    openCategory("表示");
    changeThemeToLight();
    backToList();

    fireEvent.click(ヘッダーの閉じる());

    expect(確認メッセージ()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

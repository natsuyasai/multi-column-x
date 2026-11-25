import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppSettingsPanel } from "@/components/AppSettingsPanel/AppSettingsPanel";
import i18n from "@/i18n";
import { useAppStore } from "@/store/useAppStore";
import { installThemeTokens } from "@/test-utils/storyTheme";
import {
  expectAdjacentGap,
  expectTapTargets,
  setPlatform,
} from "@/test-utils/tapTargets";
import type { Account, Column, GlobalSettings } from "@/types";

const columnSettings = {
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

const globalSettings: GlobalSettings = {
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

const accounts: Account[] = [
  {
    id: "acc-1",
    label: "テストアカウント",
    dataDirectory: "/data/1",
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const columns: Column[] = [
  {
    id: "col-1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: columnSettings,
  },
];

// アプリは documentElement の data-theme でテーマを切り替えるため、Story でもそれに合わせる
function ThemeRoot({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: ReactNode;
}) {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    el.setAttribute("data-theme", theme);
    return () => {
      if (prev === null) el.removeAttribute("data-theme");
      else el.setAttribute("data-theme", prev);
    };
  }, [theme]);
  return <>{children}</>;
}

// isMobile は useAppStore から読まれるため、描画前にストアを書き換え、アンマウント時に元へ戻す
function MobileRoot({ children }: { children: ReactNode }) {
  const [prev] = useState(() => {
    const before = useAppStore.getState().isMobile;
    useAppStore.setState({ isMobile: true });
    return before;
  });
  useEffect(() => {
    useAppStore.setState({ isMobile: true });
    return () => useAppStore.setState({ isMobile: prev });
  }, [prev]);
  return <>{children}</>;
}

// Android 向けスタイルは documentElement の data-platform で切り替わるため、Story でもそれに合わせる。
// fontSize を渡すと html の font-size を上書きし（アプリUIの表示サイズ拡大の再現）、アンマウント時に元へ戻す
function AndroidRoot({
  fontSize,
  children,
}: {
  fontSize?: string;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const el = document.documentElement;
    const prevPlatform = el.getAttribute("data-platform");
    const prevFontSize = el.style.fontSize;
    el.setAttribute("data-platform", "android");
    if (fontSize !== undefined) el.style.fontSize = fontSize;
    return () => {
      if (prevPlatform === null) el.removeAttribute("data-platform");
      else el.setAttribute("data-platform", prevPlatform);
      el.style.fontSize = prevFontSize;
    };
  }, [fontSize]);
  return <>{children}</>;
}

type Canvas = ReturnType<typeof within>;

/** デスクトップはサイドナビ、モバイルはカテゴリ一覧から、前方一致でカテゴリを開く */
async function openCategory(canvas: Canvas, label: string) {
  const nav = canvas.queryByRole("navigation");
  const scope = nav ? within(nav) : canvas;
  await userEvent.click(
    scope.getByRole("button", { name: new RegExp(`^${label}`) }),
  );
}

/** モバイルの詳細画面からカテゴリ一覧へ戻る */
async function backToList(canvas: Canvas) {
  await userEvent.click(canvas.getByRole("button", { name: "戻る" }));
}

function queryPanel(canvasElement: HTMLElement): HTMLElement {
  const panel = canvasElement.querySelector<HTMLElement>('[class*="panel"]');
  if (!panel) throw new Error("panel 要素が見つかりません");
  // Storybook ではテーマ変数の CSS が読み込まれず border が無効値になるため、枠線の有無を判定できるよう色を与える
  panel.style.setProperty("--mcx-border", "#333333");
  return panel;
}

function expectFullscreenPanel(panel: HTMLElement) {
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  return expect({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    borderRadius: style.borderTopLeftRadius,
    borderWidth: style.borderTopWidth,
  });
}

const meta: Meta<typeof AppSettingsPanel> = {
  title: "Components/AppSettingsPanel",
  component: AppSettingsPanel,
  parameters: { layout: "fullscreen" },
  // Storybook は index.css を読まないため、--mcx-* のテーマ変数を Story 側で有効にする
  decorators: [
    (Story) => {
      installThemeTokens();
      return <Story />;
    },
  ],
  args: {
    settings: globalSettings,
    columns,
    accounts,
    appVersion: "0.1.1",
    updateChecking: false,
    updateManualResult: "idle",
    onApply: fn(),
    onApplyLayout: fn(),
    onApplyColumnDefaults: fn(),
    onReloadAllWebviews: fn(),
    onLoadPreset: fn().mockResolvedValue(undefined),
    onReplaceColumnsAndRecreate: fn().mockResolvedValue(undefined),
    onExtensionsChanged: fn(),
    extensionPageAccountId: "acc-1",
    onCheckUpdate: fn(),
    onOpenOfficialSettings: fn(),
    onClose: fn(),
    pendingDataDirectoryDeletionCount: 0,
    onRetryDataDirectoryDeletion: fn(async () => ({ remaining: 0 })),
  },
};

export default meta;
type Story = StoryObj<typeof AppSettingsPanel>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("アプリ設定")).toBeInTheDocument();
    // カラム配置カテゴリに切り替えると表示順序セクションが表示される
    await openCategory(canvas, "カラム配置");
    await expect(canvas.getByText("表示順序")).toBeInTheDocument();
    // プリセットカテゴリに切り替えると保存セクションが表示される
    await openCategory(canvas, "プリセット");
    await expect(
      canvas.getByPlaceholderText("プリセット名を入力"),
    ).toBeInTheDocument();
  },
};

export const InvalidRepostHiddenUserId: Story = {
  name: "不正なユーザーIDを入力して適用するとエラーが表示される",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "閲覧・フィルタ");
    const textarea = canvas.getByRole("textbox", {
      name: "リポストを非表示にするユーザー",
    });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "valid_id{Enter}bad-id!");
    // 別カテゴリで適用しても、エラーのある「閲覧・フィルタ」へ切り替わる
    await openCategory(canvas, "メディア");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(
      within(canvas.getByRole("navigation")).getByRole("button", {
        name: /^閲覧・フィルタ/,
      }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      canvas.getByText(
        "`bad-id!` はXのユーザーIDとして正しくありません（英数字とアンダースコアの1〜15文字）",
      ),
    ).toBeInTheDocument();
    await expect(args.onApply).not.toHaveBeenCalled();
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const WithRepostHiddenUserIds: Story = {
  name: "既存のリポスト非表示ユーザーが復元表示され正規化して適用できる",
  args: {
    settings: { ...globalSettings, repostHiddenUserIds: ["user_a"] },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "閲覧・フィルタ");
    const textarea = canvas.getByRole("textbox", {
      name: "リポストを非表示にするユーザー",
    }) as HTMLTextAreaElement;
    await expect(textarea.value).toBe("user_a");
    await userEvent.type(textarea, "{Enter}{Enter}@USER_A{Enter}  user_b  ");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      expect.objectContaining({ repostHiddenUserIds: ["user_a", "user_b"] }),
    );
  },
};

export const PendingDataDirectoryDeletion: Story = {
  name: "削除保留のデータフォルダがあり再実行できる",
  args: {
    pendingDataDirectoryDeletionCount: 1,
    onRetryDataDirectoryDeletion: fn(async () => ({ remaining: 0 })),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メンテナンス");
    await expect(canvas.getByText(/1件/)).toBeInTheDocument();
    const retryButton = canvas.getByRole("button", {
      name: "データフォルダの削除を再実行",
    });
    await userEvent.click(retryButton);
    await expect(args.onRetryDataDirectoryDeletion).toHaveBeenCalledTimes(1);
    await expect(
      await canvas.findByText("データフォルダを削除しました"),
    ).toBeInTheDocument();
  },
};

export const LightTheme: Story = {
  name: "ライトテーマ",
  decorators: [
    (Story) => (
      <ThemeRoot theme="light">
        <Story />
      </ThemeRoot>
    ),
  ],
};

export const DarkTheme: Story = {
  name: "ダークテーマ",
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
};

export const ScaleThemeOverrideDisabled: Story = {
  name: "表示サイズ・テーマ変更チェックボックスOFF（初期状態）",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scaleCheckbox = canvas.getByRole("checkbox", {
      name: "カラム内の表示サイズを変更する",
    });
    const themeCheckbox = canvas.getByRole("checkbox", {
      name: "テーマを変更する",
    });
    await expect(scaleCheckbox).not.toBeChecked();
    await expect(themeCheckbox).not.toBeChecked();
    await expect(
      within(
        canvas.getByRole("group", { name: "カラム内の表示サイズ" }),
      ).getByRole("button", { name: "大" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "ライト" })).toBeDisabled();
  },
};

export const ScaleThemeOverrideEnabled: Story = {
  name: "表示サイズ・テーマ変更チェックボックスON",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "カラム内の表示サイズを変更する" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "テーマを変更する" }),
    );
    const columnScaleLarge = within(
      canvas.getByRole("group", { name: "カラム内の表示サイズ" }),
    ).getByRole("button", { name: "大" });
    await expect(columnScaleLarge).not.toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "ライト" }),
    ).not.toBeDisabled();
    await userEvent.click(columnScaleLarge);
    await userEvent.click(canvas.getByRole("button", { name: "ライト" }));
    await expect(columnScaleLarge.className).toMatch(/scaleBtnActive/);
    await expect(
      canvas.getByRole("button", { name: "ライト" }).className,
    ).toMatch(/scaleBtnActive/);
  },
};

export const UnsavedChangesConfirm: Story = {
  name: "未適用の変更があるときに ✕ で確認メッセージが出て戻れる",
  args: { onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "テーマを変更する" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "ライト" }));
    await userEvent.click(canvas.getByText("✕"));
    const dialog = await canvas.findByRole("dialog", {
      name: "未適用の変更があります",
    });
    await expect(args.onClose).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "戻る" }));
    await expect(
      canvas.queryByRole("dialog", { name: "未適用の変更があります" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "ライト" }).className,
    ).toMatch(/scaleBtnActive/);
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const EnglishLanguage: Story = {
  name: "表示言語: 英語表示で言語選択肢が各言語の表記で並ぶ",
  decorators: [
    (Story) => {
      // グローバル decorator が適用する locale より後に評価されるため、ここで英語を強制する
      void i18n.changeLanguage("en");
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole("group", { name: "Language" });
    const labels = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    await expect(labels).toEqual(["Auto", "日本語", "English"]);
  },
};

export const UiScaleXLargeSelected: Story = {
  name: "アプリUI表示サイズ: 特大選択中",
  args: {
    settings: { ...globalSettings, uiScale: "xLarge" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("カラム内の表示サイズ")).toBeInTheDocument();
    const group = within(
      canvas.getByRole("group", { name: "アプリUIの表示サイズ" }),
    );
    await expect(group.getByRole("button", { name: "特大" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      group.getByRole("button", { name: "端末に合わせる" }),
    ).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "アプリUIの表示サイズを変更する" }),
    );
    await userEvent.click(group.getByRole("button", { name: "大" }));
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      expect.objectContaining({ uiScale: "large" }),
    );
    await expect(args.onApply).not.toHaveBeenCalledWith(
      expect.objectContaining({ columnScale: expect.anything() }),
    );
  },
};

export const UiScaleMobile: Story = {
  name: "アプリUI表示サイズ: モバイル幅",
  args: {
    settings: { ...globalSettings, uiScale: "xLarge" },
  },
  decorators: [
    (Story) => (
      <MobileRoot>
        <ThemeRoot theme="dark">
          <div style={{ width: "22.5rem", height: "100vh" }}>
            <Story />
          </div>
        </ThemeRoot>
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "表示");
    await expect(
      canvas.getByRole("group", { name: "アプリUIの表示サイズ" }),
    ).toBeInTheDocument();
  },
};

const linuxH264Base = {
  downloadApplicable: true,
  h264Available: false,
  downloadState: "idle" as const,
  downloadError: null,
  relaunchError: null,
  onEnable: fn(),
  onRelaunch: fn(),
};

export const LinuxAppImageH264NotInstalled: Story = {
  name: "Linux AppImage・H.264未取得（有効化できる）",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: { ...linuxH264Base, onEnable: fn() },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await userEvent.click(
      canvas.getByRole("button", { name: "H.264 を有効化" }),
    );
    await expect(args.h264Setup?.onEnable).toHaveBeenCalledTimes(1);
    const hwCheckbox = canvas.getByRole("checkbox", {
      name: "ハードウェアデコードを使う（VA-API）",
    });
    await expect(
      canvas.queryByText("再起動後に反映されます"),
    ).not.toBeInTheDocument();
    await userEvent.click(hwCheckbox);
    await expect(
      canvas.getByText("再起動後に反映されます"),
    ).toBeInTheDocument();
  },
};

export const LinuxAppImageH264Installed: Story = {
  name: "Linux AppImage・H.264取得済み（有効化済み表示）",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: { ...linuxH264Base, h264Available: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await expect(canvas.getByText("H.264: 有効化済み")).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "H.264 を有効化" }),
    ).not.toBeInTheDocument();
  },
};

export const LinuxDeb: Story = {
  name: "Linux deb版（H.264項目なし・HWデコードのみ）",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: { ...linuxH264Base, downloadApplicable: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await expect(canvas.queryByText(/H\.264/)).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("checkbox", {
        name: "ハードウェアデコードを使う（VA-API）",
      }),
    ).toBeInTheDocument();
  },
};

export const LinuxH264Downloading: Story = {
  name: "Linux AppImage・H.264ダウンロード中",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: { ...linuxH264Base, downloadState: "downloading" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await expect(canvas.getByText("ダウンロード中…")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "H.264 を有効化" }),
    ).toBeDisabled();
  },
};

export const LinuxH264Success: Story = {
  name: "Linux AppImage・H.264取得成功（今すぐ再起動）",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: {
      ...linuxH264Base,
      h264Available: true,
      downloadState: "success",
      onRelaunch: fn(),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await userEvent.click(canvas.getByRole("button", { name: "今すぐ再起動" }));
    await expect(args.h264Setup?.onRelaunch).toHaveBeenCalledTimes(1);
  },
};

export const LinuxH264RelaunchFailed: Story = {
  name: "Linux AppImage・H.264再起動失敗（エラー表示）",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: {
      ...linuxH264Base,
      h264Available: true,
      downloadState: "success",
      relaunchError: {
        code: "relaunch.appImageMissing",
        detail: "/opt/app.AppImage",
      },
      onRelaunch: fn(),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "AppImage が見つからない",
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "/opt/app.AppImage",
    );
    await userEvent.click(canvas.getByRole("button", { name: "今すぐ再起動" }));
    await expect(args.h264Setup?.onRelaunch).toHaveBeenCalledTimes(1);
  },
};

export const LinuxH264Error: Story = {
  name: "Linux AppImage・H.264取得失敗（再試行）",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: {
      ...linuxH264Base,
      downloadState: "error",
      downloadError: "ネットワークに接続できません",
      onEnable: fn(),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await expect(
      canvas.getByText("ネットワークに接続できません"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "再試行" }));
    await expect(args.h264Setup?.onEnable).toHaveBeenCalledTimes(1);
  },
};

export const LinuxAppImageDarkTheme: Story = {
  name: "Linux AppImage・ダークテーマ",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: linuxH264Base,
  },
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
};

export const LinuxAppImageLightTheme: Story = {
  name: "Linux AppImage・ライトテーマ",
  args: {
    isLinux: true,
    startupHardwareVideoDecodeEnabled: true,
    h264Setup: linuxH264Base,
  },
  decorators: [
    (Story) => (
      <ThemeRoot theme="light">
        <Story />
      </ThemeRoot>
    ),
  ],
};

export const MobileGroups: Story = {
  name: "モバイル（カテゴリ一覧にAndroid専用・メディアに画像/動画ポップアップと注意書き）",
  decorators: [
    (Story) => (
      <MobileRoot>
        <ThemeRoot theme="dark">
          <Story />
        </ThemeRoot>
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /^Android専用/ }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /^プリセット/ }),
    ).not.toBeInTheDocument();
    await openCategory(canvas, "メディア");
    await expect(
      canvas.getByRole("heading", { level: 2, name: "メディア" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("checkbox", { name: /画像をポップアップ/ }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("checkbox", { name: /動画をポップアップ/ }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/複数カラム表示中のみ有効です/),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("checkbox", { name: /Esc/ }),
    ).not.toBeInTheDocument();
  },
};

export const MobileGroupsLightTheme: Story = {
  name: "モバイル・ライトテーマ",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    await expect(
      canvas.getByText(/複数カラム表示中のみ有効です/),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("checkbox", { name: /Esc/ }),
    ).not.toBeInTheDocument();
  },
  decorators: [
    (Story) => (
      <MobileRoot>
        <ThemeRoot theme="light">
          <Story />
        </ThemeRoot>
      </MobileRoot>
    ),
  ],
};

export const AndroidFullscreenWithMobileGroups: Story = {
  name: "Android実機相当（全画面・カテゴリ一覧にAndroid専用表示）",
  decorators: [
    (Story) => (
      <MobileRoot>
        <ThemeRoot theme="light">
          <AndroidRoot>
            <Story />
          </AndroidRoot>
        </ThemeRoot>
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /^Android専用/ }),
    ).toBeInTheDocument();
  },
};

const fullscreenExpected = () => ({
  left: 0,
  top: 0,
  width: window.innerWidth,
  height: window.innerHeight,
  borderRadius: "0px",
  borderWidth: "0px",
});

export const AndroidFullscreen: Story = {
  name: "Androidではアプリ設定が画面全体を覆って表示される",
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <AndroidRoot>
          <Story />
        </AndroidRoot>
      </ThemeRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const panel = queryPanel(canvasElement);
    await expectFullscreenPanel(panel).toEqual(fullscreenExpected());
  },
};

export const DesktopPanelUnchanged: Story = {
  name: "デスクトップではアプリ設定の見た目は従来どおり画面全体にならない",
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const panel = queryPanel(canvasElement);
    const rect = panel.getBoundingClientRect();
    await expect(rect.width).toBeLessThan(window.innerWidth);
    await expect(rect.height).toBeLessThan(window.innerHeight);
    await expect(
      parseFloat(getComputedStyle(panel).borderTopLeftRadius),
    ).toBeGreaterThan(0);
    await expect(
      parseFloat(getComputedStyle(panel).borderTopWidth),
    ).toBeGreaterThan(0);
  },
};

// 狭い画面（スマホ幅）を再現するため、vitest の browser 実行時だけ viewport を絞る。戻す関数を返す。
// Storybook の画面上で開いた場合は viewport を変えられないので何もしない
async function narrowViewport(width: number, height: number) {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  try {
    const { page } = await import("vitest/browser");
    await page.viewport(width, height);
    return () => page.viewport(originalWidth, originalHeight);
  } catch {
    return async () => {};
  }
}

function findScroller(panel: HTMLElement): HTMLElement {
  const scroller = Array.from(panel.querySelectorAll<HTMLElement>("*")).find(
    (el) => {
      const overflowY = getComputedStyle(el).overflowY;
      return (
        (overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight
      );
    },
  );
  if (!scroller) throw new Error("スクロールする本文が見つかりません");
  return scroller;
}

export const AndroidHeaderFixedBodyScrolls: Story = {
  name: "Android全画面ではヘッダーが固定されカテゴリ一覧の本文だけがスクロールする",
  decorators: [
    (Story) => (
      <MobileRoot>
        <ThemeRoot theme="dark">
          <AndroidRoot fontSize="20px">
            <Story />
          </AndroidRoot>
        </ThemeRoot>
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 640);
    try {
      const canvas = within(canvasElement);
      const panel = queryPanel(canvasElement);
      const header = canvas.getByRole("heading", { level: 2 }).parentElement
        ?.parentElement as HTMLElement;
      const scroller = findScroller(panel);
      const headerTopBefore = header.getBoundingClientRect().top;

      scroller.scrollTop = scroller.scrollHeight;

      await expect(scroller.scrollTop).toBeGreaterThan(0);
      await expect(header.getBoundingClientRect().top).toBe(headerTopBefore);
      // ページ全体はスクロールしない（二重スクロールにならない）
      await expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
        document.documentElement.clientHeight,
      );
      // 本文の最後の項目までスクロールして到達できる
      const lastItem = scroller.lastElementChild as HTMLElement;
      await expect(lastItem.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        scroller.getBoundingClientRect().bottom + 1,
      );
    } finally {
      await restoreViewport();
    }
  },
};

export const AndroidLargeScaleNoOverflow: Story = {
  name: "Android・大きな表示サイズでもカテゴリ一覧・詳細・ボタン行が画面外へはみ出さない",
  decorators: [
    (Story) => (
      <MobileRoot>
        <ThemeRoot theme="dark">
          <AndroidRoot fontSize="20px">
            <Story />
          </AndroidRoot>
        </ThemeRoot>
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 640);
    try {
      const canvas = within(canvasElement);
      const root = document.documentElement;
      await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);

      // 一覧の最後のカテゴリまで到達でき、画面幅に収まる
      const last = canvas.getByRole("button", { name: /^このアプリについて/ });
      last.scrollIntoView({ block: "end" });
      const lastRect = last.getBoundingClientRect();
      await expect(lastRect.left).toBeGreaterThanOrEqual(0);
      await expect(lastRect.right).toBeLessThanOrEqual(window.innerWidth + 1);

      // 詳細画面でもフッターボタンが画面内に収まる
      await openCategory(canvas, "表示");
      await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
      for (const name of ["キャンセル", "適用"]) {
        const rect = canvas
          .getByRole("button", { name })
          .getBoundingClientRect();
        await expect(rect.left).toBeGreaterThanOrEqual(0);
        await expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
        await expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
      }
      const back = canvas.getByRole("button", { name: "戻る" });
      await expect(back.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    } finally {
      await restoreViewport();
    }
  },
};

export const AndroidTapTargets: Story = {
  name: "Android・カテゴリ一覧と各詳細の操作要素がすべて44px以上で隣り合うボタンに間隔がある",
  args: {
    updateManualResult: "error",
    pendingDataDirectoryDeletionCount: 1,
  },
  decorators: [
    (Story) => (
      <MobileRoot>
        <Story />
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restorePlatform = setPlatform("android");
    const restoreViewport = await narrowViewport(360, 640);
    try {
      const canvas = within(canvasElement);
      await expectTapTargets(canvasElement, 44);
      await expectAdjacentGap(canvasElement, 8);
      for (const name of [
        "表示",
        "閲覧・フィルタ",
        "メディア",
        "カラム既定値",
        "Android専用",
        "メンテナンス",
        "このアプリについて",
      ]) {
        await openCategory(canvas, name);
        await expectTapTargets(canvasElement, 44);
        await expectAdjacentGap(canvasElement, 8);
        await backToList(canvas);
      }
    } finally {
      await restoreViewport();
      restorePlatform();
    }
  },
};

// 更新確認ボタンの押下で結果（最新）が出る状態を再現するラッパー
function UpdateCheckHarness(
  props: React.ComponentProps<typeof AppSettingsPanel>,
) {
  const [result, setResult] = useState<"idle" | "none" | "error">("idle");
  return (
    <AppSettingsPanel
      {...props}
      updateManualResult={result}
      onCheckUpdate={() => setResult("none")}
    />
  );
}

export const UpdateCheckResultScrollsIntoView: Story = {
  name: "更新確認の結果が下端でも見える位置まで自動スクロールされる",
  render: (args) => <UpdateCheckHarness {...args} />,
  decorators: [
    (Story) => (
      <MobileRoot>
        <Story />
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const restorePlatform = setPlatform("android");
    const restoreViewport = await narrowViewport(360, 360);
    try {
      const panel = queryPanel(canvasElement);
      await openCategory(canvas, "このアプリについて");
      await userEvent.click(canvas.getByRole("button", { name: "更新を確認" }));
      const result = await canvas.findByRole("status");
      const area = panel.querySelector<HTMLElement>('[class*="content"]');
      if (!area) throw new Error("本文の要素が見つかりません");
      // スクロールの反映を待つ
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
      const resultRect = result.getBoundingClientRect();
      const areaRect = area.getBoundingClientRect();
      await expect(resultRect.top).toBeGreaterThanOrEqual(areaRect.top);
      await expect(resultRect.bottom).toBeLessThanOrEqual(areaRect.bottom);
    } finally {
      await restoreViewport();
      restorePlatform();
    }
  },
};

export const KeyboardFocusShowsRing: Story = {
  name: "キーボードでフォーカスしたボタンにはフォーカスリングが出る",
  play: async ({ canvasElement }) => {
    // 開いた直後は選択中のカテゴリ項目に初期フォーカスがある。キーボード操作（Shift+Tab）で閉じるボタンへ移す
    await userEvent.tab({ shift: true });
    const focused = document.activeElement as HTMLElement;
    await expect(focused).toBe(
      within(canvasElement).getByRole("button", { name: "閉じる" }),
    );
    await expect(getComputedStyle(focused).outlineStyle).not.toBe("none");
  },
};

export const KeyboardFocusRingOnCheckboxRow: Story = {
  name: "キーボードでチェックボックスにフォーカスすると行全体にフォーカスリングが出る",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openCategory(canvas, "メディア");
    const checkbox = canvas.getByRole("checkbox", {
      name: "Escキーで閉じる",
    });
    // キーボードの Tab 送りで到達させる（プログラムからの focus() では focus-visible にならないことがある）
    for (let i = 0; i < 40 && document.activeElement !== checkbox; i++) {
      await userEvent.tab();
    }
    await expect(document.activeElement).toBe(checkbox);
    const label = checkbox.closest("label") as HTMLElement;
    await expect(getComputedStyle(label).outlineStyle).not.toBe("none");
  },
};

export const AndroidOtherTabsTapTargets: Story = {
  name: "Android・カラム配置とバックアップのカテゴリを開いても操作要素が44px以上で間隔があり横にはみ出さない",
  decorators: [
    (Story) => (
      <MobileRoot>
        <Story />
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const restorePlatform = setPlatform("android");
    const restoreViewport = await narrowViewport(360, 640);
    try {
      const root = document.documentElement;
      for (const name of ["カラム配置", "バックアップ"]) {
        await openCategory(canvas, name);
        await expect(
          canvas.getByRole("heading", { level: 2, name }),
        ).toBeInTheDocument();
        await expectTapTargets(canvasElement, 44);
        await expectAdjacentGap(canvasElement, 8);
        await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
        await backToList(canvas);
      }
    } finally {
      await restoreViewport();
      restorePlatform();
    }
  },
};

export const DisplayCategoryInitial: Story = {
  name: "開くと表示カテゴリが選ばれ、表示言語・テーマと表示サイズ・API残量モニターが並ぶ",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation"));
    await expect(nav.getByRole("button", { name: /^表示/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      canvas.getByRole("group", { name: "表示言語" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { level: 3, name: "テーマと表示サイズ" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { level: 3, name: "API残量モニター" }),
    ).toBeInTheDocument();
  },
};

export const NavigateCategories: Story = {
  name: "サイドナビでカテゴリを切り替えるとそのページだけが表示され、矢印キーでも移動できる",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation"));
    await openCategory(canvas, "メディア");
    await expect(
      nav.getByRole("button", { name: /^メディア/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      canvas.getByRole("checkbox", { name: "動画の自動再生を停止する" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("checkbox", { name: "テーマを変更する" }),
    ).not.toBeInTheDocument();

    await openCategory(canvas, "表示");
    nav.getByRole("button", { name: /^表示/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      nav.getByRole("button", { name: /^閲覧・フィルタ/ }),
    ).toHaveFocus();
    await expect(
      canvas.getByRole("heading", { level: 3, name: "X公式設定" }),
    ).toBeInTheDocument();
  },
};

export const ApplyAcrossCategories: Story = {
  name: "複数カテゴリで編集した値は未適用の印が付き、1回の適用でまとめて保存される",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation"));
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "テーマを変更する" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "ライト" }));
    await expect(
      nav.getByRole("button", { name: /^表示/ }),
    ).toHaveAccessibleName(/未適用の変更あり/);
    await openCategory(canvas, "メディア");
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "動画の自動再生を停止する" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "light",
        videoAutoPlayStopEnabled: false,
      }),
    );
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const InvalidNgWordsSwitchesToFilter: Story = {
  name: "別カテゴリでNGワードの入力エラーがあると適用時に閲覧・フィルタへ切り替わり印が付く",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation"));
    await openCategory(canvas, "閲覧・フィルタ");
    const textarea = canvas.getByRole("textbox", {
      name: "グローバルNGワード",
    });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "/(/");
    await openCategory(canvas, "表示");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).not.toHaveBeenCalled();
    await expect(
      nav.getByRole("button", { name: /^閲覧・フィルタ/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("button", { name: /^閲覧・フィルタ/ }),
    ).toHaveAccessibleName(/入力エラーあり/);
    await expect(canvas.getByText(/正規表現が不正です/)).toBeInTheDocument();
  },
};

export const MobileListToDetail: Story = {
  name: "Android: カテゴリ一覧から詳細へ進み、戻るボタンで一覧に戻る",
  decorators: [
    (Story) => (
      <MobileRoot>
        <ThemeRoot theme="dark">
          <AndroidRoot>
            <Story />
          </AndroidRoot>
        </ThemeRoot>
      </MobileRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryAllByRole("checkbox")).toHaveLength(0);
    await expect(
      canvas.getByRole("button", {
        name: /^メディア.*動画・ポップアップウィンドウ/,
      }),
    ).toBeInTheDocument();
    await openCategory(canvas, "表示");
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "テーマを変更する" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "ライト" }));
    await backToList(canvas);
    await expect(
      canvas.getByRole("button", { name: /^表示/ }),
    ).toHaveAccessibleName(/未適用の変更あり/);
    await expect(
      canvas.getByRole("button", { name: "適用" }),
    ).toBeInTheDocument();
  },
};

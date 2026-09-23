import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppSettingsPanel } from "@/components/AppSettingsPanel/AppSettingsPanel";
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
  mobileSwipeAreaOpacity: 50,
  mobileTwoColumnEnabled: true,
  presets: [],
  ngWords: [],
  repostHiddenUserIds: [],
  pendingDataDirectoryDeletions: [],
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

const meta: Meta<typeof AppSettingsPanel> = {
  title: "Components/AppSettingsPanel",
  component: AppSettingsPanel,
  parameters: { layout: "fullscreen" },
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
    // カラム配置タブに切り替えると表示順序セクションが表示される
    await userEvent.click(canvas.getByRole("button", { name: "カラム配置" }));
    await expect(canvas.getByText("表示順序")).toBeInTheDocument();
    // プリセットタブに切り替えると保存セクションが表示される
    await userEvent.click(canvas.getByRole("button", { name: "プリセット" }));
    await expect(
      canvas.getByPlaceholderText("プリセット名を入力"),
    ).toBeInTheDocument();
  },
};

export const InvalidRepostHiddenUserId: Story = {
  name: "不正なユーザーIDを入力して適用するとエラーが表示される",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", {
      name: "リポストを非表示にするユーザー",
    });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "valid_id{Enter}bad-id!");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
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
      name: "表示サイズを変更する",
    });
    const themeCheckbox = canvas.getByRole("checkbox", {
      name: "テーマを変更する",
    });
    await expect(scaleCheckbox).not.toBeChecked();
    await expect(themeCheckbox).not.toBeChecked();
    await expect(canvas.getByRole("button", { name: "大" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "ライト" })).toBeDisabled();
  },
};

export const ScaleThemeOverrideEnabled: Story = {
  name: "表示サイズ・テーマ変更チェックボックスON",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "表示サイズを変更する" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "テーマを変更する" }),
    );
    await expect(canvas.getByRole("button", { name: "大" })).not.toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "ライト" }),
    ).not.toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "大" }));
    await userEvent.click(canvas.getByRole("button", { name: "ライト" }));
    await expect(canvas.getByRole("button", { name: "大" }).className).toMatch(
      /scaleBtnActive/,
    );
    await expect(
      canvas.getByRole("button", { name: "ライト" }).className,
    ).toMatch(/scaleBtnActive/);
  },
};

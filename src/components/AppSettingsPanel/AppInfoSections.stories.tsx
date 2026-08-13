import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppInfoSections } from "./AppInfoSections";

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

const meta: Meta<typeof AppInfoSections> = {
  title: "Components/AppInfoSections",
  component: AppInfoSections,
  parameters: { layout: "centered" },
  args: {
    onReloadAllWebviews: fn(),
    onClearCache: fn(),
    appVersion: "0.5.2",
    updateChecking: false,
    updateManualResult: "idle",
    onCheckUpdate: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AppInfoSections>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // WebView セクションの確認
    await expect(canvas.getByText("WebView")).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "全カラムのWebViewを順番に再生成します。設定は維持されます。",
      ),
    ).toBeInTheDocument();
    // 全WebViewを再生成ボタンの確認
    const reloadBtn = canvas.getByRole("button", { name: "全WebViewを再生成" });
    await expect(reloadBtn).toBeInTheDocument();
    // キャッシュを削除ボタンの確認
    const clearCacheBtn = canvas.getByRole("button", {
      name: "不要なキャッシュを削除",
    });
    await expect(clearCacheBtn).toBeInTheDocument();
    // キャッシュ削除の説明文の確認
    await expect(
      canvas.getByText(
        "ログイン情報は保持したまま、各カラムの不要なキャッシュ（画像等）のみ削除します。",
      ),
    ).toBeInTheDocument();
    // アプリ情報セクションの確認
    await expect(canvas.getByText("アプリ情報")).toBeInTheDocument();
    await expect(
      canvas.getByText("現在のバージョン: 0.5.2"),
    ).toBeInTheDocument();
  },
};

export const OnClearCacheClick: Story = {
  name: "キャッシュ削除ボタンクリック",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const clearCacheBtn = canvas.getByRole("button", {
      name: "不要なキャッシュを削除",
    });
    await userEvent.click(clearCacheBtn);
    await expect(args.onClearCache).toHaveBeenCalled();
  },
};

export const UpdateAvailable: Story = {
  name: "更新利用可能",
  args: {
    updateManualResult: "none",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("最新のバージョンです")).toBeInTheDocument();
  },
};

export const UpdateError: Story = {
  name: "更新確認エラー",
  args: {
    updateManualResult: "error",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("更新の確認に失敗しました"),
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

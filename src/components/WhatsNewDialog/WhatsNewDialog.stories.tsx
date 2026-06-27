import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { WhatsNewDialog } from "@/components/WhatsNewDialog/WhatsNewDialog";

const LONG_NOTES = `### 新機能
- マルチカラム表示に対応しました
- ダークテーマを追加しました
- キーボードショートカットを拡充しました

### 改善
- 起動時間を短縮しました
- スクロールのパフォーマンスを改善しました

### 修正
- 特定の環境でクラッシュする問題を修正しました
- 画像が正しく表示されない問題を修正しました
- ログイン状態が失われる問題を修正しました`;

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

const meta: Meta<typeof WhatsNewDialog> = {
  title: "Components/WhatsNewDialog",
  component: WhatsNewDialog,
  parameters: { layout: "fullscreen" },
  args: {
    version: "0.2.0",
    notes: LONG_NOTES,
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof WhatsNewDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "アプリが更新されました" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("バージョン 0.2.0 の更新内容"),
    ).toBeInTheDocument();
    // 「閉じる」で onClose が呼ばれる
    await userEvent.click(canvas.getByRole("button", { name: "閉じる" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const WithoutVersion: Story = {
  name: "バージョンなし",
  args: {
    version: undefined,
    notes: "・不具合を修正しました\n・パフォーマンスを改善しました",
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

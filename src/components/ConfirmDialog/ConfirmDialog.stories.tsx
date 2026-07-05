import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";

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

const meta: Meta<typeof ConfirmDialog> = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  parameters: { layout: "fullscreen" },
  args: {
    title: "アカウントの削除",
    message: "「アカウントA」を削除しますか？セッションデータも削除されます。",
    confirmLabel: "削除する",
    cancelLabel: "キャンセル",
    onConfirm: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "「アカウントA」を削除しますか？セッションデータも削除されます。",
      ),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByText("削除する"));
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};

export const CancelByButton: Story = {
  name: "キャンセルボタン",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("キャンセル"));
    await expect(args.onCancel).toHaveBeenCalled();
  },
};

export const SingleButton: Story = {
  name: "単一ボタン",
  args: {
    singleButton: true,
    title: "再認証",
    message: "再認証に失敗しました（アカウント識別子を取得できませんでした）",
    confirmLabel: "OK",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("キャンセル")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("OK"));
    await expect(args.onConfirm).toHaveBeenCalled();
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

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { ShortcutHelpDialog } from "@/components/ShortcutHelpDialog/ShortcutHelpDialog";

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

const meta: Meta<typeof ShortcutHelpDialog> = {
  title: "Components/ShortcutHelpDialog",
  component: ShortcutHelpDialog,
  parameters: { layout: "fullscreen" },
  args: {
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ShortcutHelpDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("キーボードショートカット"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("フォーカスカラムを更新"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByText("閉じる"));
    await expect(args.onClose).toHaveBeenCalled();
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

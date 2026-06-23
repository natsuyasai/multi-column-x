import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { UpdateDialog } from "@/components/UpdateDialog/UpdateDialog";
import type { AppUpdate } from "@/services/updater";

const update: AppUpdate = {
  version: "1.2.0",
  notes: "・不具合を修正しました\n・パフォーマンスを改善しました",
};

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

const meta: Meta<typeof UpdateDialog> = {
  title: "Components/UpdateDialog",
  component: UpdateDialog,
  parameters: { layout: "fullscreen" },
  args: {
    update,
    installing: false,
    progress: null,
    onInstall: fn(),
    onLater: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof UpdateDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("バージョン 1.2.0")).toBeInTheDocument();
    // 「更新する」で onInstall が呼ばれる
    await userEvent.click(canvas.getByText("更新する"));
    await expect(args.onInstall).toHaveBeenCalled();
  },
};

export const Downloading: Story = {
  name: "ダウンロード中",
  args: {
    installing: true,
    progress: { phase: "downloading", downloaded: 4_000_000, total: 8_000_000 },
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

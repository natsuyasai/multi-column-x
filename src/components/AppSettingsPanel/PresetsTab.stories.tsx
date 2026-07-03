import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { PresetsTab } from "@/components/AppSettingsPanel/PresetsTab";
import type { ColumnPreset } from "@/types";

const presets: ColumnPreset[] = [
  {
    id: "preset-1",
    name: "ホームレイアウト",
    columns: [],
  },
  {
    id: "preset-2",
    name: "通知レイアウト",
    columns: [],
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

const meta: Meta<typeof PresetsTab> = {
  title: "Components/AppSettingsPanel/PresetsTab",
  component: PresetsTab,
  parameters: { layout: "fullscreen" },
  args: {
    presets,
    onSave: fn(),
    onLoad: fn(),
    onDelete: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof PresetsTab>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("ホームレイアウト")).toBeInTheDocument();
    // 名前を入力して保存すると onSave がその名前で呼ばれる
    await userEvent.type(
      canvas.getByPlaceholderText("プリセット名を入力"),
      "マイレイアウト",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "現在のレイアウトを保存" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith("マイレイアウト");
  },
};

export const MobileReadOnly: Story = {
  name: "モバイル（読み込み・削除のみ）",
  args: {
    isMobile: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // モバイルでは保存UIが表示されない
    await expect(
      canvas.queryByPlaceholderText("プリセット名を入力"),
    ).not.toBeInTheDocument();
    // 読み込み・削除は引き続き可能
    await expect(
      canvas.getAllByRole("button", { name: "読み込む" }),
    ).toHaveLength(2);
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

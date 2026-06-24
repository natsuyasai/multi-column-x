import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AddColumnDialog } from "@/components/AddColumnDialog/AddColumnDialog";
import type { Account } from "@/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/types";

const accounts: Account[] = [
  {
    id: "acc-1",
    label: "アカウントA",
    dataDirectory: "/data/a",
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-2",
    label: "アカウントB",
    dataDirectory: "/data/b",
    color: "#f91880",
    createdAt: "2026-02-01T00:00:00Z",
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

const meta: Meta<typeof AddColumnDialog> = {
  title: "Components/AddColumnDialog",
  component: AddColumnDialog,
  parameters: { layout: "fullscreen" },
  args: {
    accounts,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    existingColumns: [],
    onAdd: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AddColumnDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // 初期表示はホームのためタブ名入力欄が見えている
    const tabName = canvas.getByRole("textbox", { name: /タブ名（任意）/ });
    await userEvent.type(tabName, "フォロー中");
    await expect(tabName).toHaveValue("フォロー中");
    // キャンセルで onCancel が呼ばれる
    await userEvent.click(canvas.getByText("キャンセル"));
    await expect(args.onCancel).toHaveBeenCalled();
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

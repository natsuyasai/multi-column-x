import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AccountManager } from "@/components/AccountManager/AccountManager";
import type { Account } from "@/types";

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
    color: "#e0245e",
    createdAt: "2026-01-02T00:00:00Z",
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

const meta: Meta<typeof AccountManager> = {
  title: "Components/AccountManager",
  component: AccountManager,
  parameters: { layout: "fullscreen" },
  args: {
    accounts,
    defaultAccountId: "acc-1",
    onAddAccount: fn(),
    onRemoveAccount: fn(),
    onSetDefault: fn(),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AccountManager>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("アカウントA")).toBeInTheDocument();
    // 削除ボタンを押すと対象アカウント ID で onRemoveAccount が呼ばれる
    await userEvent.click(canvas.getByLabelText("アカウントB を削除"));
    await expect(args.onRemoveAccount).toHaveBeenCalledWith("acc-2");
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

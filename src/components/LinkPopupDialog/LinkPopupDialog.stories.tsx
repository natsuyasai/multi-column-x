import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { LinkPopupDialog } from "@/components/LinkPopupDialog/LinkPopupDialog";
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

const meta: Meta<typeof LinkPopupDialog> = {
  title: "Components/LinkPopupDialog",
  component: LinkPopupDialog,
  parameters: { layout: "fullscreen" },
  args: {
    accounts,
    defaultAccountId: "acc-1",
    onSubmit: fn(),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof LinkPopupDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText("https://x.com/...");
    await userEvent.type(input, "https://x.com/example");
    await expect(input).toHaveValue("https://x.com/example");
    // 「開く」で入力 URL と選択アカウント ID を伴って onSubmit が呼ばれる
    await userEvent.click(canvas.getByText("開く"));
    await expect(args.onSubmit).toHaveBeenCalledWith(
      "https://x.com/example",
      "acc-1",
    );
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

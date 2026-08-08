import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import { HelpPopover } from "@/components/HelpPopover/HelpPopover";

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

const meta: Meta<typeof HelpPopover> = {
  title: "Components/HelpPopover",
  component: HelpPopover,
  parameters: { layout: "centered" },
  args: {
    label: "正規表現の書き方",
    children: (
      <p>
        NGワードは通常の文字列のほか、正規表現でも指定できます。
        <br />
        例: <code>^spam</code> は「spam」で始まる文言にマッチします。
      </p>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof HelpPopover>;

export const Default: Story = {
  name: "デフォルト（閉じた状態）",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const OpenOnClick: Story = {
  name: "トリガークリックで開く",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: args.label });
    await userEvent.click(trigger);

    const dialog = canvas.getByRole("dialog", { name: args.label });
    await expect(dialog).toBeInTheDocument();
    await expect(dialog).toHaveTextContent("正規表現");
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

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { CodecWarningDialog } from "@/components/CodecWarningDialog/CodecWarningDialog";

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

const meta: Meta<typeof CodecWarningDialog> = {
  title: "Components/CodecWarningDialog",
  component: CodecWarningDialog,
  parameters: { layout: "fullscreen" },
  args: {
    missingH264: true,
    missingAac: true,
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof CodecWarningDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("動画/音声を再生できない可能性があります"),
    ).toBeInTheDocument();
    // 「閉じる」で onClose が呼ばれる
    await userEvent.click(canvas.getByRole("button", { name: "閉じる" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const MissingH264Only: Story = {
  name: "H.264のみ欠如",
  args: {
    missingH264: true,
    missingAac: false,
  },
};

export const MissingAacOnly: Story = {
  name: "AACのみ欠如",
  args: {
    missingH264: false,
    missingAac: true,
  },
};

export const MissingBoth: Story = {
  name: "両方欠如",
  args: {
    missingH264: true,
    missingAac: true,
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

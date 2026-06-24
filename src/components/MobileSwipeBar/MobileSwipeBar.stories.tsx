import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, within } from "storybook/test";
import { MobileSwipeBar } from "@/components/MobileSwipeBar/MobileSwipeBar";

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

const meta: Meta<typeof MobileSwipeBar> = {
  title: "Components/MobileSwipeBar",
  component: MobileSwipeBar,
  parameters: { layout: "fullscreen" },
  args: {
    height: 28,
    swipeState: null,
    onSwipeNavigate: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof MobileSwipeBar>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("⠿ スワイプで切替 ⠿")).toBeInTheDocument();
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

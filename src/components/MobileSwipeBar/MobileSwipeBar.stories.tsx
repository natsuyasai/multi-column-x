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
    opacity: 50,
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

export const SwipeProgressLeft: Story = {
  name: "左スワイプ中（進行フィードバック）",
  args: {
    swipeState: { direction: "left", phase: "progress" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rightHint = canvas.getByText("›");
    await expect(rightHint.parentElement?.className).toContain("progressLeft");
  },
};

export const SwipeProgressRight: Story = {
  name: "右スワイプ中（進行フィードバック）",
  args: {
    swipeState: { direction: "right", phase: "progress" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const leftHint = canvas.getByText("‹");
    await expect(leftHint.parentElement?.className).toContain("progressRight");
  },
};

export const OpacityLow: Story = {
  name: "透過度低（20%）",
  args: {
    opacity: 20,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grip = canvas.getByText("⠿ スワイプで切替 ⠿");
    const bar = grip.parentElement as HTMLElement;
    await expect(bar.style.opacity).toBe("0.2");
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { NoAccountsPrompt } from "@/components/NoAccountsPrompt/NoAccountsPrompt";

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

// Android 向けスタイルは documentElement の data-platform で切り替わるため、Story でもそれに合わせる。
// fontSize を渡すと html の font-size を上書きし（アプリUIの表示サイズ拡大の再現）、アンマウント時に元へ戻す
function AndroidRoot({
  fontSize,
  children,
}: {
  fontSize?: string;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const el = document.documentElement;
    const prevPlatform = el.getAttribute("data-platform");
    const prevFontSize = el.style.fontSize;
    el.setAttribute("data-platform", "android");
    if (fontSize !== undefined) el.style.fontSize = fontSize;
    return () => {
      if (prevPlatform === null) el.removeAttribute("data-platform");
      else el.setAttribute("data-platform", prevPlatform);
      el.style.fontSize = prevFontSize;
    };
  }, [fontSize]);
  return <>{children}</>;
}

// 狭い画面（スマホ幅）を再現するため、vitest の browser 実行時だけ viewport を絞る。戻す関数を返す。
// Storybook の画面上で開いた場合は viewport を変えられないので何もしない
async function narrowViewport(width: number, height: number) {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  try {
    const { page } = await import("vitest/browser");
    await page.viewport(width, height);
    return () => page.viewport(originalWidth, originalHeight);
  } catch {
    return async () => {};
  }
}

const meta: Meta<typeof NoAccountsPrompt> = {
  title: "Components/NoAccountsPrompt",
  component: NoAccountsPrompt,
  parameters: { layout: "fullscreen" },
  args: { onOpenAccountManager: fn() },
};

export default meta;
type Story = StoryObj<typeof NoAccountsPrompt>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("先にアカウントを追加してください"),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "アカウント管理を開く" }),
    );
    await expect(args.onOpenAccountManager).toHaveBeenCalledTimes(1);
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

export const AndroidLargeScaleWidens: Story = {
  name: "アカウント未登録の案内ダイアログは文字が大きくても画面幅に応じて広がる",
  decorators: [
    (Story) => (
      <AndroidRoot fontSize="20px">
        <Story />
      </AndroidRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 640);
    try {
      const canvas = within(canvasElement);
      const prompt = canvasElement.querySelector<HTMLElement>(
        '[class*="prompt"]',
      ) as HTMLElement;
      const rect = prompt.getBoundingClientRect();
      // 画面の半分で頭打ちにならず、画面幅は超えない
      await expect(rect.width).toBeGreaterThan(window.innerWidth / 2);
      await expect(rect.left).toBeGreaterThanOrEqual(0);
      await expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      const button = canvas.getByRole("button", {
        name: "アカウント管理を開く",
      });
      const b = button.getBoundingClientRect();
      await expect(b.left).toBeGreaterThanOrEqual(0);
      await expect(b.right).toBeLessThanOrEqual(window.innerWidth);
      await expect(b.bottom).toBeLessThanOrEqual(window.innerHeight);
    } finally {
      await restoreViewport();
    }
  },
};

export const NormalScaleWideViewport: Story = {
  name: "アカウント未登録の案内ダイアログは通常サイズでは25rem以下に収まる",
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(1000, 700);
    try {
      const prompt = canvasElement.querySelector<HTMLElement>(
        '[class*="prompt"]',
      ) as HTMLElement;
      const rootFontPx = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      await expect(prompt.getBoundingClientRect().width).toBeLessThanOrEqual(
        rootFontPx * 25 + 1,
      );
    } finally {
      await restoreViewport();
    }
  },
};

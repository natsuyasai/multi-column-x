import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import { ApiRateLimitIndicator } from "@/components/ApiRateLimitIndicator/ApiRateLimitIndicator";
import { installAppReset, installThemeTokens } from "@/test-utils/storyTheme";
import { expectTapTargets, setPlatform } from "@/test-utils/tapTargets";
import type { Account, ApiRateLimitBucket } from "@/types";

const NOW_SEC = Math.floor(Date.now() / 1000);

function bucket(
  bucketKey: string,
  remaining: number,
  limit: number,
): ApiRateLimitBucket {
  return {
    bucketKey,
    remaining,
    limit,
    reset: NOW_SEC + 300,
    updatedAt: Date.now(),
  };
}

const accounts: Account[] = [
  {
    id: "acc-1",
    label: "アカウント1",
    dataDirectory: "/data/1",
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-2",
    label: "アカウント2",
    dataDirectory: "/data/2",
    color: "#e0245e",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const normalRateLimits: Record<string, Record<string, ApiRateLimitBucket>> = {
  "acc-1": {
    HomeTimeline: bucket("HomeTimeline", 900, 900),
    SearchTimeline: bucket("SearchTimeline", 480, 500),
  },
  "acc-2": {
    HomeTimeline: bucket("HomeTimeline", 850, 900),
  },
};

const warningRateLimits: Record<string, Record<string, ApiRateLimitBucket>> = {
  "acc-1": {
    HomeTimeline: bucket("HomeTimeline", 900, 900),
    SearchTimeline: bucket("SearchTimeline", 15, 100), // 15% -> warning
  },
  "acc-2": {
    HomeTimeline: bucket("HomeTimeline", 850, 900),
  },
};

const criticalRateLimits: Record<string, Record<string, ApiRateLimitBucket>> = {
  "acc-1": {
    HomeTimeline: bucket("HomeTimeline", 900, 900),
    NotificationsTimeline: bucket("NotificationsTimeline", 2, 100), // 2% -> critical
  },
  "acc-2": {
    SearchTimeline: bucket("SearchTimeline", 15, 100), // 15% -> warning
  },
};

const emptyRateLimits: Record<string, Record<string, ApiRateLimitBucket>> = {};

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

const meta: Meta<typeof ApiRateLimitIndicator> = {
  title: "Components/ApiRateLimitIndicator",
  component: ApiRateLimitIndicator,
  parameters: { layout: "centered" },
  // Storybook は index.css を読まないため、--mcx-* のテーマ変数を Story 側で有効にする
  decorators: [
    (Story) => {
      installThemeTokens();
      return <Story />;
    },
  ],
  args: {
    accounts,
    apiRateLimits: normalRateLimits,
  },
};

export default meta;
type Story = StoryObj<typeof ApiRateLimitIndicator>;

export const Default: Story = {
  name: "通常状態",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "APIレート制限" });
    await expect(trigger.className).not.toMatch(/warning|critical/i);

    await userEvent.click(trigger);

    await expect(canvas.getByText("アカウント1")).toBeInTheDocument();
    await expect(canvas.getByText("480/500")).toBeInTheDocument();
    await expect(canvas.getByText("900/900")).toBeInTheDocument();
  },
};

export const WarningState: Story = {
  name: "警告状態を含む",
  args: {
    apiRateLimits: warningRateLimits,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "APIレート制限" });
    await expect(trigger.className).toMatch(/warning/i);

    await userEvent.click(trigger);

    const warningRow = canvas.getByText("15/100").closest("li");
    await expect(warningRow?.className).toMatch(/warning/i);
  },
};

export const CriticalState: Story = {
  name: "危険状態を含む",
  args: {
    apiRateLimits: criticalRateLimits,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "APIレート制限" });
    await expect(trigger.className).toMatch(/critical/i);

    await userEvent.click(trigger);

    const criticalRow = canvas.getByText("2/100").closest("li");
    await expect(criticalRow?.className).toMatch(/critical/i);
  },
};

export const Empty: Story = {
  name: "未計測プレースホルダー（データが空）",
  args: {
    apiRateLimits: emptyRateLimits,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "APIレート制限" });

    await userEvent.click(trigger);

    const unobservedLabels = canvas.getAllByText("-/-");
    await expect(unobservedLabels.length).toBe(accounts.length * 5);
  },
};

export const LightTheme: Story = {
  name: "ライトテーマ",
  args: {
    apiRateLimits: warningRateLimits,
  },
  decorators: [
    (Story) => (
      <ThemeRoot theme="light">
        <Story />
      </ThemeRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "APIレート制限" }),
    );
    await expect(canvas.getByText("アカウント1")).toBeInTheDocument();
  },
};

export const MobileOverlay: Story = {
  name: "モバイル表示（オーバーレイで中央固定）",
  args: {
    apiRateLimits: warningRateLimits,
    isMobile: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "APIレート制限" });

    await userEvent.click(trigger);

    await expect(canvas.getByRole("dialog")).toBeInTheDocument();
    await expect(canvas.getByText("アカウント1")).toBeInTheDocument();
  },
};

export const DarkTheme: Story = {
  name: "ダークテーマ",
  args: {
    apiRateLimits: criticalRateLimits,
  },
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "APIレート制限" }),
    );
    await expect(canvas.getByText("アカウント1")).toBeInTheDocument();
  },
};

export const AndroidTapTarget: Story = {
  name: "Android・トリガーが44px以上になりポップオーバーが画面内に収まる",
  args: { apiRateLimits: warningRateLimits, isMobile: true },
  play: async ({ canvasElement }) => {
    const restorePlatform = setPlatform("android");
    try {
      await expectTapTargets(canvasElement, 44);
      const canvas = within(canvasElement);
      await userEvent.click(
        canvas.getByRole("button", { name: "APIレート制限" }),
      );
      const rect = canvas.getByRole("dialog").getBoundingClientRect();
      await expect(rect.left).toBeGreaterThanOrEqual(0);
      await expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      );
    } finally {
      restorePlatform();
    }
  },
};

export const DesktopKeepsDensity: Story = {
  name: "デスクトップ・トリガーはTopBarの行（2rem）内に収まる密度のまま",
  args: { apiRateLimits: criticalRateLimits },
  play: async ({ canvasElement }) => {
    const restorePlatform = setPlatform("desktop");
    const removeReset = installAppReset();
    try {
      const trigger = within(canvasElement).getByRole("button", {
        name: "APIレート制限",
      });
      const rootFontPx = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      // TopBar の 1 行は 2rem。危険状態の記号付きでも行内に収まり、44px 化もされない
      await expect(trigger.getBoundingClientRect().height).toBeLessThanOrEqual(
        rootFontPx * 1.5,
      );
    } finally {
      removeReset();
      restorePlatform();
    }
  },
};

export const KeyboardFocusShowsRing: Story = {
  name: "キーボードでフォーカスしたトリガーにはフォーカスリングが出る",
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", {
      name: "APIレート制限",
    });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(getComputedStyle(trigger).outlineStyle).not.toBe("none");
  },
};

export const EscapeReturnsFocusToTrigger: Story = {
  name: "Escapeで閉じるとフォーカスがトリガーへ戻る",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "APIレート制限" });
    await userEvent.click(trigger);
    await expect(canvas.getByRole("dialog")).toBeInTheDocument();
    // クリックでトリガーに残ったフォーカスを外し、Escape による復帰を確かめる
    trigger.blur();
    await expect(trigger).not.toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await expect(trigger).toHaveFocus();
  },
};

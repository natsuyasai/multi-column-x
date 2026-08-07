import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import { ApiRateLimitIndicator } from "@/components/ApiRateLimitIndicator/ApiRateLimitIndicator";
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
    await expect(canvas.getByText("検索")).toBeInTheDocument();
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
  name: "データが空",
  args: {
    apiRateLimits: emptyRateLimits,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "APIレート制限" });

    await userEvent.click(trigger);

    const emptyLabels = canvas.getAllByText("データなし");
    await expect(emptyLabels.length).toBe(accounts.length);
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

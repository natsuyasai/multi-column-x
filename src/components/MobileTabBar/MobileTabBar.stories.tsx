import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { MobileTabBar } from "@/components/MobileTabBar/MobileTabBar";
import { installAppReset, installThemeTokens } from "@/test-utils/storyTheme";
import { expectAdjacentGap, expectTapTargets } from "@/test-utils/tapTargets";
import type { Account, Column } from "@/types";

const settings = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: false,
  hideHeaderEnabled: true,
  hideTweetInputEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  repostHiddenUserIds: [],
  whitelistEnabled: false,
  whitelistWords: [],
  returnToLastReadEnabled: false,
};

const account: Account = {
  id: "acc-1",
  label: "アカウント1",
  dataDirectory: "/data/1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

const columns: Column[] = [
  {
    id: "col-1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings,
  },
  {
    id: "col-2",
    accountId: "acc-1",
    pageType: "notifications",
    width: 350,
    order: 1,
    gridRow: 1,
    gridCol: 2,
    heightMode: "auto",
    settings,
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

// index.css の `*` リセット（border-box など）を再現する。固定高さのバーは border-box 前提で、
// Storybook は index.css を読まないため、これが無いと border 分だけ高さが増える
function AppReset({ children }: { children: ReactNode }) {
  useLayoutEffect(() => installAppReset(), []);
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

const meta: Meta<typeof MobileTabBar> = {
  title: "Components/MobileTabBar",
  component: MobileTabBar,
  parameters: { layout: "fullscreen" },
  // Storybook は index.css を読まないため、--mcx-* のテーマ変数を Story 側で有効にする
  decorators: [
    (Story) => {
      installThemeTokens();
      return (
        <AppReset>
          <Story />
        </AppReset>
      );
    },
  ],
  args: {
    columns,
    accounts: [account],
    activeColumnId: "col-1",
    onSelectColumn: fn(),
    onAddColumn: fn(),
    onAccountManager: fn(),
    onAppSettings: fn(),
    onOpenLinkPopup: fn(),
    onComposeTweet: fn(),
    onTabAction: fn(),
    onDoubleTapColumn: fn(),
    apiRateLimitMonitorEnabled: true,
    apiRateLimits: {},
    onApiRateLimitPopoverOpenChange: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof MobileTabBar>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("ホーム")).toBeInTheDocument();
    await expect(canvas.getByText("通知")).toBeInTheDocument();
    // タブをタップすると対応する列 ID で onSelectColumn が呼ばれる
    await userEvent.click(canvas.getByText("通知"));
    await expect(args.onSelectColumn).toHaveBeenCalledWith("col-2");
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

const manyColumns: Column[] = [0, 1, 2, 3, 4].map((i) => ({
  ...columns[0],
  id: `col-${i + 1}`,
  order: i,
  gridCol: i + 1,
  pageType: i % 2 === 0 ? "home" : "notifications",
  label: `カラム${i + 1}`,
}));

const androidDecorator = (fontSize?: string) => [
  (Story: () => ReactNode) => (
    <AndroidRoot fontSize={fontSize}>
      <Story />
    </AndroidRoot>
  ),
];

function queryMenu(canvasElement: HTMLElement): HTMLElement {
  const menu = canvasElement.querySelector<HTMLElement>('[class*="menu"]');
  if (!menu) throw new Error("メニュー列が見つかりません");
  return menu;
}

export const AndroidLargeScaleMenuReachable: Story = {
  name: "大きな表示サイズでもボトムバーの全メニューに到達できる",
  args: { columns: manyColumns },
  decorators: androidDecorator("20px"),
  play: async ({ canvasElement, args }) => {
    const restoreViewport = await narrowViewport(360, 640);
    try {
      const canvas = within(canvasElement);
      await userEvent.click(canvas.getByTitle("メニュー表示の切り替え"));
      const menu = queryMenu(canvasElement);
      await expect(menu.scrollWidth).toBeGreaterThan(menu.clientWidth);
      await expect(getComputedStyle(menu).overflowX).toMatch(/auto|scroll/);

      const addButton = canvas.getByRole("button", { name: "カラムを追加" });
      addButton.scrollIntoView({ inline: "end" });
      const rect = addButton.getBoundingClientRect();
      await expect(rect.left).toBeGreaterThanOrEqual(0);
      await expect(rect.right).toBeLessThanOrEqual(window.innerWidth + 1);
      await userEvent.click(addButton);
      await expect(args.onAddColumn).toHaveBeenCalledTimes(1);

      // バーの高さは変わらず、ページ全体にも横スクロールは出ない
      const bar = menu.parentElement as HTMLElement;
      const rootFontPx = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      await expect(bar.getBoundingClientRect().height).toBeCloseTo(
        rootFontPx * 3.5,
        0,
      );
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      );
    } finally {
      await restoreViewport();
    }
  },
};

export const AndroidLargeScaleTabsNotCrushed: Story = {
  name: "大きな表示サイズでもボトムバーのタブ領域が潰れない",
  args: { columns: manyColumns },
  decorators: androidDecorator("20px"),
  play: async ({ canvasElement, args }) => {
    const restoreViewport = await narrowViewport(360, 640);
    try {
      const canvas = within(canvasElement);
      await userEvent.click(canvas.getByTitle("メニュー表示の切り替え"));
      const tabs = canvasElement.querySelector<HTMLElement>('[class*="tabs"]');
      if (!tabs) throw new Error("タブ領域が見つかりません");
      const rootFontPx = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      // タブ1つ分の最小幅（6.25rem）は常に確保される
      await expect(tabs.clientWidth).toBeGreaterThanOrEqual(
        rootFontPx * 6.25 - 1,
      );
      await expect(tabs.scrollWidth).toBeGreaterThan(tabs.clientWidth);
      const lastTab = canvas.getByText("カラム5");
      lastTab.scrollIntoView({ inline: "end" });
      await userEvent.click(lastTab);
      await expect(args.onSelectColumn).toHaveBeenCalledWith("col-5");
    } finally {
      await restoreViewport();
    }
  },
};

export const AndroidNormalScaleNoScroll: Story = {
  name: "通常サイズではボトムバーのメニューがスクロールなしで全て見える",
  decorators: androidDecorator(),
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(480, 640);
    try {
      const canvas = within(canvasElement);
      await userEvent.click(canvas.getByTitle("メニュー表示の切り替え"));
      const menu = queryMenu(canvasElement);
      await expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth);
      const rect = canvas
        .getByRole("button", { name: "カラムを追加" })
        .getBoundingClientRect();
      await expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    } finally {
      await restoreViewport();
    }
  },
};

// バー内のすべての操作要素が、バー（3.5rem 固定）の高さ・画面の幅に収まって 44px 以上・間隔 8px 以上であること
async function expectBarTapTargetsFit(canvasElement: HTMLElement) {
  const bar = canvasElement.querySelector("nav");
  if (!bar) throw new Error("タブバーが見つかりません");
  const barRect = bar.getBoundingClientRect();
  const rootFontPx = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  await expect(barRect.height).toBeCloseTo(rootFontPx * 3.5, 0);
  await expectTapTargets(canvasElement, 44);
  await expectAdjacentGap(canvasElement, 8);
  const controls = canvasElement.querySelectorAll('button, [role="button"]');
  for (const control of Array.from(controls)) {
    const rect = control.getBoundingClientRect();
    await expect(rect.top).toBeGreaterThanOrEqual(barRect.top - 0.5);
    await expect(rect.bottom).toBeLessThanOrEqual(barRect.bottom + 0.5);
  }
  // タブ 1 つ分の最小幅（6.25rem）は Android でも縮まない
  const tabs = canvasElement.querySelectorAll('[role="button"]');
  await expect(tabs.length).toBeGreaterThan(0);
  for (const tab of Array.from(tabs)) {
    await expect(tab.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      rootFontPx * 6.25 - 0.5,
    );
  }
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
}

export const AndroidTapTargetsFitBar: Story = {
  name: "Android・ボトムバーの操作要素が44px以上・間隔8px以上でバーの高さに収まる",
  args: { columns: manyColumns },
  decorators: androidDecorator(),
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 640);
    try {
      await userEvent.click(
        within(canvasElement).getByRole("button", {
          name: "メニュー表示の切り替え",
        }),
      );
      await expectBarTapTargetsFit(canvasElement);
    } finally {
      await restoreViewport();
    }
  },
};

export const AndroidLargeScaleTapTargetsFitBar: Story = {
  name: "Android・UI表示サイズ特大でもボトムバーの操作要素がバーの高さに収まる",
  args: { columns: manyColumns },
  decorators: androidDecorator("20px"),
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 640);
    try {
      await userEvent.click(
        within(canvasElement).getByRole("button", {
          name: "メニュー表示の切り替え",
        }),
      );
      await expectBarTapTargetsFit(canvasElement);
    } finally {
      await restoreViewport();
    }
  },
};

export const SelectedTabIsMarked: Story = {
  name: "選択中のタブだけが現在地として伝わり、キーボードでフォーカスリングが出る",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const current = canvasElement.querySelectorAll('[aria-current="true"]');
    await expect(current).toHaveLength(1);
    await expect(current[0]).toHaveTextContent("ホーム");

    await userEvent.tab();
    const firstTab = canvas.getByText("ホーム").closest('[role="button"]');
    await expect(firstTab).toHaveFocus();
    await expect(getComputedStyle(firstTab!).outlineStyle).not.toBe("none");
  },
};

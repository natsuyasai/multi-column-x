import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { PresetsTab } from "@/components/AppSettingsPanel/PresetsTab";
import { installThemeTokens } from "@/test-utils/storyTheme";
import {
  expectAdjacentGap,
  expectTapTargets,
  setPlatform,
} from "@/test-utils/tapTargets";
import type { ColumnPreset } from "@/types";

const presets: ColumnPreset[] = [
  {
    id: "preset-1",
    name: "ホームレイアウト",
    columns: [],
  },
  {
    id: "preset-2",
    name: "通知レイアウト",
    columns: [],
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

const meta: Meta<typeof PresetsTab> = {
  title: "Components/AppSettingsPanel/PresetsTab",
  component: PresetsTab,
  parameters: { layout: "fullscreen" },
  // Storybook は index.css を読まないため、--mcx-* のテーマ変数を Story 側で有効にする
  decorators: [
    (Story) => {
      installThemeTokens();
      return <Story />;
    },
  ],
  args: {
    presets,
    onSave: fn(),
    onLoad: fn(),
    onDelete: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof PresetsTab>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("ホームレイアウト")).toBeInTheDocument();
    // 名前を入力して保存すると onSave がその名前で呼ばれる
    await userEvent.type(
      canvas.getByPlaceholderText("プリセット名を入力"),
      "マイレイアウト",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "現在のレイアウトを保存" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith("マイレイアウト");
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

export const AndroidTapTargets: Story = {
  name: "Android・すべての操作要素が44px以上で隣り合うボタンに間隔があり横にはみ出さない",
  play: async ({ canvasElement }) => {
    const restorePlatform = setPlatform("android");
    const restoreViewport = await narrowViewport(360, 640);
    try {
      await expectTapTargets(canvasElement, 44);
      await expectAdjacentGap(canvasElement, 8);
      const root = document.documentElement;
      await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    } finally {
      await restoreViewport();
      restorePlatform();
    }
  },
};

export const KeyboardFocusShowsRing: Story = {
  name: "キーボードでフォーカスした入力欄にはフォーカスリングが出る",
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const focused = document.activeElement as HTMLElement;
    await expect(focused).toBe(
      within(canvasElement).getByRole("textbox", {
        name: "プリセット名を入力",
      }),
    );
    await expect(getComputedStyle(focused).outlineStyle).not.toBe("none");
  },
};

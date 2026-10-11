import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { UpdateDialog } from "@/components/UpdateDialog/UpdateDialog";
import type { AppUpdate } from "@/services/updater";

const update: AppUpdate = {
  version: "1.2.0",
  notes: "・不具合を修正しました\n・パフォーマンスを改善しました",
};

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

function queryDialog(canvasElement: HTMLElement): HTMLElement {
  const dialog = canvasElement.querySelector<HTMLElement>('[class*="dialog"]');
  if (!dialog) throw new Error("ダイアログ要素が見つかりません");
  return dialog;
}

// 幅・高さが画面内に収まり、縦に溢れるときは内部スクロールで末尾のボタンへ到達できる
async function expectFitsAndScrollable(dialog: HTMLElement) {
  const rect = dialog.getBoundingClientRect();
  await expect(rect.left).toBeGreaterThanOrEqual(0);
  await expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
  await expect(rect.top).toBeGreaterThanOrEqual(0);
  await expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
  if (dialog.scrollHeight > dialog.clientHeight) {
    await expect(getComputedStyle(dialog).overflowY).toMatch(/auto|scroll/);
  }
  const buttons = dialog.querySelectorAll<HTMLElement>("button");
  const last = buttons[buttons.length - 1];
  last.scrollIntoView({ block: "end" });
  const lastRect = last.getBoundingClientRect();
  await expect(lastRect.top).toBeGreaterThanOrEqual(0);
  await expect(lastRect.bottom).toBeLessThanOrEqual(window.innerHeight);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
}

const meta: Meta<typeof UpdateDialog> = {
  title: "Components/UpdateDialog",
  component: UpdateDialog,
  parameters: { layout: "fullscreen" },
  args: {
    update,
    installing: false,
    progress: null,
    onInstall: fn(),
    onLater: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof UpdateDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("バージョン 1.2.0")).toBeInTheDocument();
    // 「更新する」で onInstall が呼ばれる
    await userEvent.click(canvas.getByText("更新する"));
    await expect(args.onInstall).toHaveBeenCalled();
  },
};

export const Downloading: Story = {
  name: "ダウンロード中",
  args: {
    installing: true,
    progress: { phase: "downloading", downloaded: 4_000_000, total: 8_000_000 },
  },
};

export const InstallFailed: Story = {
  name: "インストール失敗",
  args: {
    installError:
      "更新のインストールに失敗しました。時間をおいて再度お試しください。",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole("alert");
    await expect(alert).toHaveTextContent(
      "更新のインストールに失敗しました。時間をおいて再度お試しください。",
    );
    // 失敗表示中も更新ボタンは押せる状態
    await expect(canvas.getByText("更新する")).toBeEnabled();
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

export const AndroidFitsLargeScale: Story = {
  name: "Android・大きな表示サイズでも更新ダイアログが画面内に収まりスクロールできる",
  decorators: [
    (Story) => (
      <AndroidRoot fontSize="20px">
        <Story />
      </AndroidRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(300, 260);
    try {
      const dialog = queryDialog(canvasElement);
      await expectFitsAndScrollable(dialog);
    } finally {
      await restoreViewport();
    }
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";

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

const meta: Meta<typeof ConfirmDialog> = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  parameters: { layout: "fullscreen" },
  args: {
    title: "アカウントの削除",
    message: "「アカウントA」を削除しますか？セッションデータも削除されます。",
    confirmLabel: "削除する",
    cancelLabel: "キャンセル",
    onConfirm: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "「アカウントA」を削除しますか？セッションデータも削除されます。",
      ),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByText("削除する"));
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};

export const CancelByButton: Story = {
  name: "キャンセルボタン",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("キャンセル"));
    await expect(args.onCancel).toHaveBeenCalled();
  },
};

export const SingleButton: Story = {
  name: "単一ボタン",
  args: {
    singleButton: true,
    title: "再認証",
    message: "再認証に失敗しました（アカウント識別子を取得できませんでした）",
    confirmLabel: "OK",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("キャンセル")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText("OK"));
    await expect(args.onConfirm).toHaveBeenCalled();
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

export const AndroidCenteredWithinViewport: Story = {
  name: "Android・小さなダイアログは中央表示のままで幅が画面内に収まる",
  args: { message: "短いメッセージ" },
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
      const rect = dialog.getBoundingClientRect();
      // 画面全体を覆わず、中央に表示される
      await expect(rect.width).toBeLessThan(window.innerWidth);
      await expect(
        Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2),
      ).toBeLessThanOrEqual(1);
      await expectFitsAndScrollable(dialog);
    } finally {
      await restoreViewport();
    }
  },
};

export const AndroidScrollableWhenTall: Story = {
  name: "Android・小さなダイアログは縦に収まらないときスクロールできる",
  args: {
    message: Array.from(
      { length: 12 },
      (_, i) => `${i + 1}行目の長いメッセージです。`,
    ).join("\n"),
  },
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
      await expect(dialog.scrollHeight).toBeGreaterThan(dialog.clientHeight);
      await expectFitsAndScrollable(dialog);
    } finally {
      await restoreViewport();
    }
  },
};

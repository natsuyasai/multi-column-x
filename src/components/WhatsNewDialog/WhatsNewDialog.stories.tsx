import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { WhatsNewDialog } from "@/components/WhatsNewDialog/WhatsNewDialog";

const LONG_NOTES = `### 新機能
- マルチカラム表示に対応しました
- ダークテーマを追加しました
- キーボードショートカットを拡充しました

### 改善
- 起動時間を短縮しました
- スクロールのパフォーマンスを改善しました

### 修正
- 特定の環境でクラッシュする問題を修正しました
- 画像が正しく表示されない問題を修正しました
- ログイン状態が失われる問題を修正しました`;

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

function queryPanel(canvasElement: HTMLElement): HTMLElement {
  const panel = canvasElement.querySelector<HTMLElement>('[class*="dialog"]');
  if (!panel) throw new Error("panel 要素が見つかりません");
  // Storybook ではテーマ変数の CSS が読み込まれず border が無効値になるため、枠線の有無を判定できるよう色を与える
  panel.style.setProperty("--mcx-border", "#333333");
  return panel;
}

function expectFullscreenPanel(panel: HTMLElement) {
  const rect = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  return expect({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    borderRadius: style.borderTopLeftRadius,
    borderWidth: style.borderTopWidth,
  });
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

const meta: Meta<typeof WhatsNewDialog> = {
  title: "Components/WhatsNewDialog",
  component: WhatsNewDialog,
  parameters: { layout: "fullscreen" },
  args: {
    version: "0.2.0",
    notes: LONG_NOTES,
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof WhatsNewDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "アプリが更新されました" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("バージョン 0.2.0 の更新内容"),
    ).toBeInTheDocument();
    // 「閉じる」で onClose が呼ばれる
    await userEvent.click(canvas.getByRole("button", { name: "閉じる" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const WithoutVersion: Story = {
  name: "バージョンなし",
  args: {
    version: undefined,
    notes: "・不具合を修正しました\n・パフォーマンスを改善しました",
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

export const AndroidFullscreen: Story = {
  name: "Androidでは更新内容が画面全体を覆って表示される",
  decorators: [
    (Story) => (
      <AndroidRoot>
        <Story />
      </AndroidRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const panel = queryPanel(canvasElement);
    await expectFullscreenPanel(panel).toEqual({
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      borderRadius: "0px",
      borderWidth: "0px",
    });
  },
};

export const AndroidHeaderFixedBodyScrolls: Story = {
  name: "Android全画面の更新内容ではヘッダーが固定され本文だけがスクロールする",
  decorators: [
    (Story) => (
      <AndroidRoot fontSize="20px">
        <Story />
      </AndroidRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 400);
    try {
      const canvas = within(canvasElement);
      const panel = queryPanel(canvasElement);
      const header = canvas.getByText("アプリが更新されました");
      await expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
      const headerTopBefore = header.getBoundingClientRect().top;

      panel.scrollTop = panel.scrollHeight;

      await expect(panel.scrollTop).toBeGreaterThan(0);
      await expect(header.getBoundingClientRect().top).toBe(headerTopBefore);
      // ページ全体はスクロールしない（二重スクロールにならない）
      await expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
        document.documentElement.clientHeight,
      );
      // 本文の最後の要素まで到達できる
      const lastItem = panel.lastElementChild as HTMLElement;
      await expect(lastItem.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        panel.getBoundingClientRect().bottom + 1,
      );
    } finally {
      await restoreViewport();
    }
  },
};

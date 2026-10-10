import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AddColumnDialog } from "@/components/AddColumnDialog/AddColumnDialog";
import type { Account } from "@/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/types";

const accounts: Account[] = [
  {
    id: "acc-1",
    label: "アカウントA",
    dataDirectory: "/data/a",
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "acc-2",
    label: "アカウントB",
    dataDirectory: "/data/b",
    color: "#f91880",
    createdAt: "2026-02-01T00:00:00Z",
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

const meta: Meta<typeof AddColumnDialog> = {
  title: "Components/AddColumnDialog",
  component: AddColumnDialog,
  parameters: { layout: "fullscreen" },
  args: {
    accounts,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    existingColumns: [],
    onAdd: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AddColumnDialog>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // 初期表示はホームのためタブ名入力欄が見えている
    const tabName = canvas.getByRole("textbox", { name: /タブ名（任意）/ });
    await userEvent.type(tabName, "フォロー中");
    await expect(tabName).toHaveValue("フォロー中");
    // キャンセルで onCancel が呼ばれる
    await userEvent.click(canvas.getByText("キャンセル"));
    await expect(args.onCancel).toHaveBeenCalled();
  },
};

export const ExternalUrl: Story = {
  name: "外部URL（アカウント非依存）",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    // アカウント非依存のためアカウント選択欄は表示されない
    expect(canvas.queryByLabelText("アカウント")).not.toBeInTheDocument();
    const urlInput = canvas.getByLabelText("URL");
    await userEvent.type(urlInput, "https://example.com/");
    await expect(urlInput).toHaveValue("https://example.com/");
    await userEvent.click(canvas.getByRole("button", { name: "追加" }));
    await expect(args.onAdd).toHaveBeenCalled();
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

export const WithDisplayName: Story = {
  name: "表示名を指定して追加",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const labelInput = canvas.getByRole("textbox", { name: /表示名（任意）/ });
    await userEvent.type(labelInput, "仕事用");
    await expect(labelInput).toHaveValue("仕事用");
    await userEvent.click(canvas.getByRole("button", { name: "追加" }));
    await expect(args.onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ label: "仕事用" }),
    );
  },
};

export const AndroidFullscreen: Story = {
  name: "Androidではカラム追加が画面全体を覆って表示される",
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
  name: "Android全画面のカラム追加ではヘッダーが固定され本文だけがスクロールする",
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
      const header = canvas.getByText("カラムを追加");
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

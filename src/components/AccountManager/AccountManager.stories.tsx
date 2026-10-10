import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AccountManager } from "@/components/AccountManager/AccountManager";
import type { Account } from "@/types";

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
    color: "#e0245e",
    createdAt: "2026-01-02T00:00:00Z",
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
  const panel = canvasElement.querySelector<HTMLElement>('[class*="panel"]');
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

const meta: Meta<typeof AccountManager> = {
  title: "Components/AccountManager",
  component: AccountManager,
  parameters: { layout: "fullscreen" },
  args: {
    accounts,
    defaultAccountId: "acc-1",
    onAddAccount: fn(),
    onRemoveAccount: fn(),
    onSetDefault: fn(),
    onUpdateAccount: fn(),
    onClose: fn(),
    onReauthAccount: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AccountManager>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("アカウントA")).toBeInTheDocument();
    // 削除ボタンを押すと対象アカウント ID で onRemoveAccount が呼ばれる
    await userEvent.click(canvas.getByLabelText("アカウントB を削除"));
    await expect(args.onRemoveAccount).toHaveBeenCalledWith("acc-2");
  },
};

export const ReauthAccount: Story = {
  name: "アカウント再認証",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // 再認証ボタンを押すと対象アカウント ID で onReauthAccount が呼ばれる
    await userEvent.click(canvas.getByLabelText("アカウントA を再認証"));
    await expect(args.onReauthAccount).toHaveBeenCalledWith("acc-1");
  },
};

export const EditAccount: Story = {
  name: "アカウント編集",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("アカウントA を編集"));
    const input = canvas.getByLabelText("アカウント名");
    await userEvent.clear(input);
    await userEvent.type(input, "推し垢");
    await userEvent.click(canvas.getByText("保存"));
    await expect(args.onUpdateAccount).toHaveBeenCalledWith("acc-1", {
      label: "推し垢",
    });
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
  name: "Androidではアカウント管理が画面全体を覆って表示される",
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
  name: "Android全画面のアカウント管理ではヘッダーが固定され本文だけがスクロールする",
  decorators: [
    (Story) => (
      <AndroidRoot fontSize="20px">
        <Story />
      </AndroidRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 260);
    try {
      const canvas = within(canvasElement);
      const panel = queryPanel(canvasElement);
      const header = canvas.getByText("アカウント管理")
        .parentElement as HTMLElement;
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

export const AndroidHeaderDoesNotOverlapBody: Story = {
  name: "Android全画面のアカウント管理では先頭でヘッダーが本文に重ならず上端に表示される",
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
      const header = canvas.getByText("アカウント管理")
        .parentElement as HTMLElement;
      const firstBody = header.nextElementSibling as HTMLElement;
      await expect(panel.scrollTop).toBe(0);
      // ヘッダーは画面上端から始まる（panel の padding 分だけ下へずれない）
      await expect(header.getBoundingClientRect().top).toBe(0);
      // 本文の先頭がヘッダーの下に隠れない
      await expect(
        firstBody.getBoundingClientRect().top,
      ).toBeGreaterThanOrEqual(header.getBoundingClientRect().bottom);
    } finally {
      await restoreViewport();
    }
  },
};

export const NarrowTwoRowItems: Story = {
  name: "狭い幅や大きな表示サイズでもアカウント行が横にはみ出さず名前と星が1段目にボタンが2段目に並ぶ",
  decorators: [
    (Story) => (
      <AndroidRoot fontSize="24px">
        <Story />
      </AndroidRoot>
    ),
  ],
  play: async ({ canvasElement }) => {
    const restoreViewport = await narrowViewport(360, 700);
    try {
      const canvas = within(canvasElement);
      const panel = queryPanel(canvasElement);
      const name = canvas.getAllByText(accounts[0].label)[0];
      const item = name.closest('[class*="item"]') as HTMLElement;
      const star = item.querySelector(
        '[data-testid^="icon-star"]',
      ) as HTMLElement;
      const editBtn = canvas.getAllByRole("button", { name: /を編集/ })[0];
      const removeBtn = canvas.getAllByRole("button", { name: /を削除/ })[0];

      // 1段目: 名前と星が同じ高さ、2段目: ボタンはその下
      await expect(
        Math.abs(
          name.getBoundingClientRect().top - star.getBoundingClientRect().top,
        ),
      ).toBeLessThan(name.getBoundingClientRect().height);
      await expect(editBtn.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        name.getBoundingClientRect().bottom,
      );
      // 横にはみ出さない
      await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
      await expect(removeBtn.getBoundingClientRect().right).toBeLessThanOrEqual(
        item.getBoundingClientRect().right,
      );
      await expect(star.getBoundingClientRect().right).toBeLessThanOrEqual(
        item.getBoundingClientRect().right,
      );
    } finally {
      await restoreViewport();
    }
  },
};

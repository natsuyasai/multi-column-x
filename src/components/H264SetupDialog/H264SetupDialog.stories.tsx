import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { H264SetupDialog } from "@/components/H264SetupDialog/H264SetupDialog";
import { installThemeTokens } from "@/test-utils/storyTheme";
import {
  expectAdjacentGap,
  expectTapTargets,
  setPlatform,
} from "@/test-utils/tapTargets";

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

const meta: Meta<typeof H264SetupDialog> = {
  title: "Components/H264SetupDialog",
  component: H264SetupDialog,
  parameters: { layout: "fullscreen" },
  // Storybook は index.css を読まないため、--mcx-* のテーマ変数を Story 側で有効にする
  decorators: [
    (Story) => {
      installThemeTokens();
      return <Story />;
    },
  ],
  args: {
    downloadState: "idle",
    downloadError: null,
    onDownload: fn(),
    onDismiss: fn(),
    onClose: fn(),
    onRelaunch: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof H264SetupDialog>;

const withTheme =
  (theme: "light" | "dark") =>
  (Story: React.ComponentType): React.ReactElement => (
    <ThemeRoot theme={theme}>
      <Story />
    </ThemeRoot>
  );

export const Idle: Story = {
  name: "案内（ライト）",
  decorators: [withTheme("light")],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // 「今はしない」で onDismiss が呼ばれる
    await userEvent.click(canvas.getByRole("button", { name: "今はしない" }));
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const IdleDark: Story = {
  name: "案内（ダーク）",
  decorators: [withTheme("dark")],
};

export const Downloading: Story = {
  name: "ダウンロード中（ライト）",
  args: { downloadState: "downloading" },
  decorators: [withTheme("light")],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("ダウンロード中…")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "ダウンロードして有効化" }),
    ).toBeDisabled();
  },
};

export const DownloadingDark: Story = {
  name: "ダウンロード中（ダーク）",
  args: { downloadState: "downloading" },
  decorators: [withTheme("dark")],
};

export const Success: Story = {
  name: "成功（ライト）",
  args: { downloadState: "success" },
  decorators: [withTheme("light")],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "今すぐ再起動" }));
    await expect(args.onRelaunch).toHaveBeenCalledTimes(1);
  },
};

export const SuccessDark: Story = {
  name: "成功（ダーク）",
  args: { downloadState: "success" },
  decorators: [withTheme("dark")],
};

export const ErrorState: Story = {
  name: "失敗（ライト）",
  args: {
    downloadState: "error",
    downloadError:
      "ダウンロードに失敗しました。ネットワークを確認してください。",
  },
  decorators: [withTheme("light")],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "ネットワークを確認してください",
    );
    // 色だけでなくアイコンと接頭ラベルでもエラーだと分かる
    await expect(
      within(canvas.getByRole("alert")).getByText("エラー:"),
    ).toBeInTheDocument();
    // 「再試行」で onDownload が呼ばれる
    await userEvent.click(canvas.getByRole("button", { name: "再試行" }));
    await expect(args.onDownload).toHaveBeenCalledTimes(1);
  },
};

export const ErrorDark: Story = {
  name: "失敗（ダーク）",
  args: {
    downloadState: "error",
    downloadError:
      "ダウンロードに失敗しました。ネットワークを確認してください。",
  },
  decorators: [withTheme("dark")],
};

export const AndroidFitsLargeScale: Story = {
  name: "Android・大きな表示サイズでもH.264案内ダイアログが画面内に収まりスクロールできる",
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

export const AndroidTapTargets: Story = {
  name: "Android・すべての操作要素が44px以上で隣り合うボタンに間隔がある",
  play: async ({ canvasElement }) => {
    const restorePlatform = setPlatform("android");
    try {
      await expectTapTargets(canvasElement, 44);
      await expectAdjacentGap(canvasElement, 8);
    } finally {
      restorePlatform();
    }
  },
};

export const KeyboardFocusShowsRing: Story = {
  name: "キーボードでフォーカスしたボタンにはフォーカスリングが出る",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 初期フォーカスは主操作ボタン。Shift+Tab で副次ボタンへ移す
    await userEvent.tab({ shift: true });
    const focused = document.activeElement as HTMLElement;
    await expect(focused).toBe(
      canvas.getByRole("button", { name: "今はしない" }),
    );
    await expect(getComputedStyle(focused).outlineStyle).not.toBe("none");
  },
};

export const DownloadingLooksDisabled: Story = {
  name: "ダウンロード中は両方のボタンが見た目でも無効だと分かる",
  args: { downloadState: "downloading" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["今はしない", "ダウンロードして有効化"]) {
      const button = canvas.getByRole("button", { name });
      await expect(button).toBeDisabled();
      await expect(Number(getComputedStyle(button).opacity)).toBeLessThan(1);
      await expect(getComputedStyle(button).cursor).toBe("not-allowed");
    }
  },
};

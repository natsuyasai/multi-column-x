import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { SettingsPanel } from "@/components/SettingsPanel/SettingsPanel";
import type { Column } from "@/types";

const columnSettings = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: true,
  hideHeaderEnabled: false,
  hideTweetInputEnabled: false,
  showCustomMenu: false,
  scrollPosRestoreEnabled: false,
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

const column: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: columnSettings,
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

const meta: Meta<typeof SettingsPanel> = {
  title: "Components/SettingsPanel",
  component: SettingsPanel,
  parameters: { layout: "fullscreen" },
  args: {
    column,
    isMobile: false,
    onApply: fn(),
    onClose: fn(),
    onReload: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof SettingsPanel>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("カラム設定")).toBeInTheDocument();
    // 新着デスクトップ通知トグルをオンにして適用すると設定に反映される
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "新着をデスクトップ通知する" }),
    );
    // NGワードを入力して適用すると配列として onApply に渡される
    const textarea = canvas.getByPlaceholderText(
      "1行に1ワードで入力（/正規表現/flags 形式も指定可）",
    );
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}bot");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({
        ngWords: ["spam", "bot"],
        desktopNotifyEnabled: true,
      }),
      350,
      undefined,
    );
  },
};

export const WithDisplayName: Story = {
  name: "表示名を設定して適用",
  args: {
    column: {
      ...column,
      label: "仕事用",
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const displayNameInput = canvas.getByRole("textbox", {
      name: "表示名",
    }) as HTMLInputElement;
    await expect(displayNameInput.value).toBe("仕事用");
    await userEvent.clear(displayNameInput);
    await userEvent.type(displayNameInput, "私用");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      "col-1",
      expect.anything(),
      350,
      "私用",
    );
  },
};

export const ExternalColumn: Story = {
  name: "外部URLカラム",
  args: {
    column: {
      ...column,
      pageType: "external",
      customUrl: "https://example.com",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("カラム設定")).toBeInTheDocument();
    // externalカラムではカスタムCSS以外の設定項目は表示されない
    await expect(canvas.queryByText("自動更新")).not.toBeInTheDocument();
    await expect(canvas.queryByText("表示")).not.toBeInTheDocument();
    await expect(canvas.queryByText("画像")).not.toBeInTheDocument();
    await expect(canvas.queryByText("画像ブラー")).not.toBeInTheDocument();
    await expect(canvas.queryByText("通知")).not.toBeInTheDocument();
    await expect(canvas.queryByText("NGワード")).not.toBeInTheDocument();
    // カラム幅とカスタムCSSは表示される
    await expect(canvas.getByText("カラム")).toBeInTheDocument();
    await expect(canvas.getByText("カスタム CSS")).toBeInTheDocument();
  },
};

export const WhitelistEnabled: Story = {
  name: "ホワイトリスト有効",
  args: {
    column: {
      ...column,
      settings: {
        ...columnSettings,
        whitelistEnabled: true,
        whitelistWords: ["推し", "限定"],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("checkbox", { name: "ホワイトリストを有効にする" }),
    ).toBeChecked();
    const textarea = canvas.getByPlaceholderText(
      "1行に1ワードで入力（/正規表現/flags 形式も指定可、ホワイトリスト）",
    ) as HTMLTextAreaElement;
    await expect(textarea).not.toBeDisabled();
    await expect(textarea.value).toBe("推し\n限定");
  },
};

export const InvalidRepostHiddenUserId: Story = {
  name: "不正なユーザーIDを入力して適用するとエラーが表示される",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", {
      name: "リポストを非表示にするユーザー",
    });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "valid_id{Enter}bad-id!");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(
      canvas.getByText(
        "`bad-id!` はXのユーザーIDとして正しくありません（英数字とアンダースコアの1〜15文字）",
      ),
    ).toBeInTheDocument();
    await expect(args.onApply).not.toHaveBeenCalled();
  },
};

export const WithRepostHiddenUserIds: Story = {
  name: "既存のリポスト非表示ユーザーが復元表示され正規化して適用できる",
  args: {
    column: {
      ...column,
      settings: { ...columnSettings, repostHiddenUserIds: ["user_a"] },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", {
      name: "リポストを非表示にするユーザー",
    }) as HTMLTextAreaElement;
    await expect(textarea.value).toBe("user_a");
    await userEvent.type(textarea, "{Enter}{Enter}@USER_A{Enter}  user_b  ");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ repostHiddenUserIds: ["user_a", "user_b"] }),
      350,
      undefined,
    );
  },
};

export const ReturnToLastReadToggle: Story = {
  name: "前回の境目へ戻るボタンの表示設定（ホームカラム）",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", {
      name: "更新後に前回の続きへ戻るボタンを表示する",
    });
    await expect(checkbox).toBeInTheDocument();
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ returnToLastReadEnabled: true }),
      350,
      undefined,
    );
  },
};

export const ReturnToLastReadHiddenForNonHomeColumn: Story = {
  name: "ホーム以外のカラムでは戻るボタンの設定項目が表示されない",
  args: {
    column: {
      ...column,
      pageType: "notifications",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("checkbox", {
        name: "更新後に前回の続きへ戻るボタンを表示する",
      }),
    ).not.toBeInTheDocument();
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
  name: "Androidではカラム設定が画面全体を覆って表示される",
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <AndroidRoot>
          <Story />
        </AndroidRoot>
      </ThemeRoot>
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

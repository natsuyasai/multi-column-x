import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
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
    const textarea = canvas.getByPlaceholderText("1行に1ワードで入力");
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

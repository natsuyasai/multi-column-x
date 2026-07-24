import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { TopBar } from "@/components/TopBar/TopBar";
import type { Account, Column } from "@/types";

const settings = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: false,
  areaRemoveEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
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

const meta: Meta<typeof TopBar> = {
  title: "Components/TopBar",
  component: TopBar,
  parameters: { layout: "fullscreen" },
  args: {
    columns,
    accounts: [account],
    expanded: false,
    onToggleExpand: fn(),
    onAddColumn: fn(),
    onAccountManager: fn(),
    onAppSettings: fn(),
    onComposeTweet: fn(),
    onOpenLinkPopup: fn(),
    onJumpToColumn: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof TopBar>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // ツイート作成ボタンを押すと onComposeTweet が呼ばれる
    await userEvent.click(canvas.getByTitle("ツイートを作成 (Ctrl+T)"));
    await expect(args.onComposeTweet).toHaveBeenCalled();
    // 展開トグルを押すと onToggleExpand が呼ばれる
    await userEvent.click(canvas.getByTitle("ツールバーを展開 (Ctrl+B)"));
    await expect(args.onToggleExpand).toHaveBeenCalled();
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

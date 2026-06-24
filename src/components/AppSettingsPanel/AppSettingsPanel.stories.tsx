import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppSettingsPanel } from "@/components/AppSettingsPanel/AppSettingsPanel";
import type { Account, Column, GlobalSettings } from "@/types";

const columnSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
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

const globalSettings: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  defaultShowCountdown: true,
  defaultAreaRemoveEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: false,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: true,
  showSortButtons: false,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: true,
  columnScale: "default",
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
  presets: [],
  ngWords: [],
};

const accounts: Account[] = [
  {
    id: "acc-1",
    label: "テストアカウント",
    dataDirectory: "/data/1",
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

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
    settings: columnSettings,
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

const meta: Meta<typeof AppSettingsPanel> = {
  title: "Components/AppSettingsPanel",
  component: AppSettingsPanel,
  parameters: { layout: "fullscreen" },
  args: {
    settings: globalSettings,
    columns,
    accounts,
    appVersion: "0.1.1",
    updateChecking: false,
    updateManualResult: "idle",
    onApply: fn(),
    onApplyLayout: fn(),
    onApplyColumnDefaults: fn(),
    onReloadAllWebviews: fn(),
    onCheckUpdate: fn(),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AppSettingsPanel>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("アプリ設定")).toBeInTheDocument();
    // カラム配置タブに切り替えると表示順序セクションが表示される
    await userEvent.click(canvas.getByRole("button", { name: "カラム配置" }));
    await expect(canvas.getByText("表示順序")).toBeInTheDocument();
    // プリセットタブに切り替えると保存セクションが表示される
    await userEvent.click(canvas.getByRole("button", { name: "プリセット" }));
    await expect(
      canvas.getByPlaceholderText("プリセット名を入力"),
    ).toBeInTheDocument();
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

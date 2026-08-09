import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { ColumnLayoutTab } from "@/components/AppSettingsPanel/ColumnLayoutTab";
import type { Account, Column } from "@/types";

const columnSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  hideHeaderEnabled: true,
  hideTweetInputEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  whitelistEnabled: false,
  whitelistWords: [],
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
  {
    id: "col-2",
    accountId: "acc-1",
    pageType: "notifications",
    width: 350,
    order: 1,
    gridRow: 1,
    gridCol: 2,
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

const meta: Meta<typeof ColumnLayoutTab> = {
  title: "Components/AppSettingsPanel/ColumnLayoutTab",
  component: ColumnLayoutTab,
  parameters: { layout: "fullscreen" },
  args: {
    columns,
    accounts,
    onApply: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ColumnLayoutTab>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByTestId("grid-preview");
    // 割当済みセルをクリックすると高さ設定が表示される
    await userEvent.click(within(grid).getByText("テストアカウント - ホーム"));
    await expect(canvas.getByText(/高さ設定/)).toBeInTheDocument();
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

// gridCol=1 に2カラム（縦積み）、gridCol=2 に1カラム
const stackedColumns: Column[] = [
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
  {
    id: "col-2",
    accountId: "acc-1",
    pageType: "notifications",
    width: 350,
    order: 1,
    gridRow: 2,
    gridCol: 1,
    heightMode: "auto",
    settings: columnSettings,
  },
  {
    id: "col-3",
    accountId: "acc-1",
    pageType: "search",
    width: 350,
    order: 2,
    gridRow: 1,
    gridCol: 2,
    heightMode: "auto",
    settings: columnSettings,
  },
];

export const StackedColumns: Story = {
  name: "縦積みレイアウト",
  args: {
    columns: stackedColumns,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const orderList = canvas.getByTestId("order-list");
    const items = within(orderList).getAllByRole("listitem");
    // 列グループ単位なので、縦積み2カラム+単独1カラムで2件になる
    await expect(items).toHaveLength(2);

    const upButtons = within(orderList).getAllByLabelText("上へ");
    const downButtons = within(orderList).getAllByLabelText("下へ");
    await expect(upButtons[0]).toBeDisabled();
    await expect(downButtons[downButtons.length - 1]).toBeDisabled();

    const handles = within(orderList).getAllByLabelText("ドラッグして並び替え");
    await expect(handles).toHaveLength(2);
  },
};

export const Mobile: Story = {
  name: "モバイル",
  args: {
    isMobile: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByTestId("grid-preview");
    await expect(grid).not.toBeVisible();

    await expect(canvas.getByText("表示順序")).toBeVisible();

    const orderList = canvas.getByTestId("order-list");
    const handles = within(orderList).getAllByLabelText("ドラッグして並び替え");
    await expect(handles.length).toBeGreaterThan(0);
  },
};

export const ReorderByButton: Story = {
  name: "ボタンで並び替え",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const orderList = canvas.getByTestId("order-list");

    const getItemTexts = () =>
      within(orderList)
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");

    const before = getItemTexts();
    await expect(before[0]).toContain("ホーム");

    const downButtons = within(orderList).getAllByLabelText("下へ");
    await userEvent.click(downButtons[0]);

    const after = getItemTexts();
    await expect(after[0]).toContain("通知");
    await expect(after[1]).toContain("ホーム");
  },
};

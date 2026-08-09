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

// 表示順序リストのカラム名を2行表示にする改修の検証用データ。
// - グループ1（gridCol=1 に縦積み2カラム）は「A / B」連結で長くなるケース
// - グループ2（gridCol=2 の単独カラム）は区切りの無い長い文字列（overflow-wrap の検証）
const longNameColumns: Column[] = [
  {
    id: "long-col-1",
    accountId: "acc-1",
    pageType: "home",
    label: "テストアカウント（プライベート運用・通知多め）- ホームタイムライン",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: columnSettings,
  },
  {
    id: "long-col-2",
    accountId: "acc-1",
    pageType: "notifications",
    label: "テストアカウント（プライベート運用・通知多め）- 通知一覧",
    width: 350,
    order: 1,
    gridRow: 2,
    gridCol: 1,
    heightMode: "auto",
    settings: columnSettings,
  },
  {
    id: "long-col-3",
    accountId: "acc-1",
    pageType: "search",
    label:
      "検索カラム-とても長いキーワードを含む検索条件でカラム名が非常に長くなるケースのサンプルテキストです",
    width: 350,
    order: 2,
    gridRow: 1,
    gridCol: 2,
    heightMode: "auto",
    settings: columnSettings,
  },
];

// グループ1（縦積み）は "A / B" 連結後のラベル、グループ2（単独）はそのままのラベル。
// ColumnLayoutTab 内の getGroupLabel と同じ連結ルール（" / " join）に合わせている。
const longGroup1Label = `${longNameColumns[0].label} / ${longNameColumns[1].label}`;
const longGroup2Label = longNameColumns[2].label ?? "";

export const LongColumnNames: Story = {
  name: "長いカラム名",
  args: {
    columns: longNameColumns,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const orderList = canvas.getByTestId("order-list");

    const nameEl1 = within(orderList).getByText(longGroup1Label);
    const nameEl2 = within(orderList).getByText(longGroup2Label);
    await expect(nameEl1).toBeInTheDocument();
    await expect(nameEl2).toBeInTheDocument();

    // 1行 nowrap + ellipsis のままだと scrollWidth が clientWidth を超える。
    // 2行折り返し（-webkit-line-clamp）に変わっていれば、要素幅の中で折り返されるため
    // 横方向の溢れ（scrollWidth > clientWidth）は発生しない。
    await expect(nameEl1.scrollWidth).toBeLessThanOrEqual(nameEl1.clientWidth);
    await expect(nameEl2.scrollWidth).toBeLessThanOrEqual(nameEl2.clientWidth);
  },
};

export const MobileLongColumnNames: Story = {
  name: "モバイル・長いカラム名",
  args: {
    columns: longNameColumns,
    isMobile: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const orderList = canvas.getByTestId("order-list");

    const nameEl1 = within(orderList).getByText(longGroup1Label);
    const nameEl2 = within(orderList).getByText(longGroup2Label);
    await expect(nameEl1).toBeInTheDocument();
    await expect(nameEl2).toBeInTheDocument();
  },
};

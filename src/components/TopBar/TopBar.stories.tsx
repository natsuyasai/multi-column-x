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

// gridCol=1 に 2 行（multi-1a, multi-1b）、gridCol=2 に 1 行（multi-2）の複数行を含む構成
const multiRowColumns: Column[] = [
  { ...columns[0], id: "multi-1a", order: 0, gridRow: 1, gridCol: 1 },
  {
    ...columns[1],
    id: "multi-1b",
    order: 1,
    gridRow: 2,
    gridCol: 1,
  },
  {
    ...columns[0],
    id: "multi-2",
    pageType: "search",
    searchQuery: "tauri",
    order: 2,
    gridRow: 1,
    gridCol: 2,
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
    onClose: fn(),
    onReorderColumnGroup: fn(),
    apiRateLimitMonitorEnabled: true,
    apiRateLimits: {},
    onApiRateLimitPopoverOpenChange: fn(),
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

export const MultiRowColumn: Story = {
  name: "複数行の列（collapsed）",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 同じ列の 2 行は 1 つの列グループ要素にまとまる（列グループは全体で 2 つ）
    const groups = canvas.getAllByTestId("topbar-column-group");
    await expect(groups).toHaveLength(2);
    await expect(
      within(groups[0]).getAllByTitle(/アカウント1 - /),
    ).toHaveLength(2);
    await expect(canvas.getAllByLabelText("ドラッグして並び替え")).toHaveLength(
      2,
    );
  },
};

export const MultiRowColumnExpanded: Story = {
  name: "複数行の列（expanded）",
  args: { columns: multiRowColumns, expanded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    await expect(groups).toHaveLength(2);
    // expanded では列内の各カラムに閉じるボタンがある
    await expect(
      within(groups[0]).getAllByTitle("カラムを閉じる"),
    ).toHaveLength(2);
  },
};

// ハンドルを押して水平方向へ動かし、ポインタを離さない途中経過までの座標列
async function dragHandleOver(
  user: ReturnType<typeof userEvent.setup>,
  from: HTMLElement,
  to: HTMLElement,
) {
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const y = fromRect.top + fromRect.height / 2;
  const startX = fromRect.left + fromRect.width / 2;
  const endX = toRect.left + toRect.width / 2;
  await user.pointer([
    {
      keys: "[MouseLeft>]",
      target: from,
      coords: { clientX: startX, clientY: y },
    },
    // 8px の activationConstraint を超えてからドラッグ開始とみなされる
    { coords: { clientX: startX + 12, clientY: y } },
    { coords: { clientX: endX, clientY: y } },
  ]);
}

export const Dragging: Story = {
  name: "ドラッグ中の状態",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement }) => {
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const [first, second] = canvas.getAllByLabelText("ドラッグして並び替え");
    await dragHandleOver(user, first, second);
    // ポインタを離さず、ドラッグ中の見た目をそのまま確認できる状態で止める
    await expect(first).toHaveAttribute("aria-pressed", "true");
  },
};

export const DragAndDrop: Story = {
  name: "ドラッグ＆ドロップで並び替え",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement, args }) => {
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const [first, second] = canvas.getAllByLabelText("ドラッグして並び替え");
    await dragHandleOver(user, first, second);
    await user.pointer({ keys: "[/MouseLeft]" });
    // 複数行の列（index 0）を右隣の列（index 1）の位置へ移動する
    await expect(args.onReorderColumnGroup).toHaveBeenCalledWith(0, 1);
  },
};

export const DarkThemeDragging: Story = {
  name: "ダークテーマ（ドラッグ中）",
  args: { columns: multiRowColumns },
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
  play: Dragging.play,
};

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
    // ドラッグ用のつまみは表示されない（グループの領域全体がドラッグの取っ手）
    await expect(
      canvas.queryAllByLabelText("ドラッグして並び替え"),
    ).toHaveLength(0);
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

// ドラッグ開始の閾値（8px）に満たない移動量
const UNDER_THRESHOLD_MOVE = 7;

// ドラッグ開始の閾値（8px）を超える最初の一歩の移動量
const DRAG_FIRST_STEP = 12;

// from を押して水平方向へ動かす（ポインタは離さない）。
// from / to はグループ内のボタンを渡す
async function dragOver(
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
    { coords: { clientX: startX + DRAG_FIRST_STEP, clientY: y } },
    { coords: { clientX: endX, clientY: y } },
  ]);
}

// dnd-kit は、ドラッグ終了の 50ms 後に document へ登録した click 抑制リスナーを外す。
// このリスナーは全インスタンスで同一の関数のため、ストーリーが連続実行されると直前のストーリーの
// タイマーが今のストーリーのリスナーを外してしまい、ドラッグ直後の click が抑制されなくなる。
// 実操作では起こらないテスト実行特有の干渉なので、タイマーが切れるまで待ってから始める
const DND_KIT_LISTENER_CLEANUP_MS = 50;

// 前のストーリーの呼び出し・タイマーを持ち越さないよう、開始時に状態をそろえる
async function prepareStory(args: {
  onJumpToColumn?: unknown;
  onClose?: unknown;
  onReorderColumnGroup?: unknown;
}) {
  for (const callback of [
    args.onJumpToColumn,
    args.onClose,
    args.onReorderColumnGroup,
  ]) {
    (callback as ReturnType<typeof fn>).mockClear();
  }
  await new Promise((resolve) =>
    setTimeout(resolve, DND_KIT_LISTENER_CLEANUP_MS + 10),
  );
}

export const Dragging: Story = {
  name: "ドラッグ中の状態",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement }) => {
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const [from] = within(groups[0]).getAllByRole("button");
    const [to] = within(groups[1]).getAllByRole("button");
    await dragOver(user, from, to);
    // ポインタを離さず、ドラッグ中の見た目をそのまま確認できる状態で止める
    await expect(groups[0]).toHaveAttribute("data-dragging", "true");
  },
};

export const DragAndDrop: Story = {
  name: "ドラッグ＆ドロップで並び替え",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const [from] = within(groups[0]).getAllByRole("button");
    const [to] = within(groups[1]).getAllByRole("button");
    await dragOver(user, from, to);
    await user.pointer({ keys: "[/MouseLeft]" });
    // 複数行の列（index 0）を右隣の列（index 1）の位置へ移動する
    await expect(args.onReorderColumnGroup).toHaveBeenCalledWith(0, 1);
  },
};

export const DragFromSecondRowOfColumn: Story = {
  name: "複数行の列の2行目から掴んでも列ごと移動する",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const fromButtons = within(groups[0]).getAllByRole("button");
    const [to] = within(groups[1]).getAllByRole("button");
    await dragOver(user, fromButtons[1], to);
    await user.pointer({ keys: "[/MouseLeft]" });
    await expect(args.onReorderColumnGroup).toHaveBeenCalledWith(0, 1);
  },
};

export const DragFromCloseButton: Story = {
  name: "展開表示で閉じるボタンから掴んでドラッグできる",
  args: { columns: multiRowColumns, expanded: true },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const [closeButton] = within(groups[0]).getAllByLabelText("カラムを閉じる");
    const [to] = within(groups[1]).getAllByRole("button");
    await dragOver(user, closeButton, to);
    await user.pointer({ keys: "[/MouseLeft]" });
    await expect(args.onReorderColumnGroup).toHaveBeenCalledWith(0, 1);
    // ドラッグとして扱われるので閉じる操作は発生しない
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const NoJumpAfterDrag: Story = {
  name: "ドラッグして離してもジャンプは発生しない",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const [from] = within(groups[0]).getAllByRole("button");
    const [to] = within(groups[1]).getAllByRole("button");
    await dragOver(user, from, to);
    await user.pointer({ keys: "[/MouseLeft]" });
    // 並び替えは成立している（ドラッグとして処理された）
    await expect(args.onReorderColumnGroup).toHaveBeenCalledWith(0, 1);
    await expect(args.onJumpToColumn).not.toHaveBeenCalled();
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const ClickWhenMovedUnderThreshold: Story = {
  name: "8px未満の移動ではクリックとして扱われる",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const [from] = within(groups[0]).getAllByRole("button");
    const rect = from.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const startX = rect.left + rect.width / 2;
    // 7px だけ動かして離す（閾値 8px 未満。他の位置へは動かさない）
    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: from,
        coords: { clientX: startX, clientY: y },
      },
      { coords: { clientX: startX + UNDER_THRESHOLD_MOVE, clientY: y } },
    ]);
    try {
      await expect(groups[0]).not.toHaveAttribute("data-dragging");
    } finally {
      // 検証が失敗してもポインタを離す。押したままだと dnd-kit のドラッグが残り、
      // 次のストーリーのクリックが click 抑制リスナーに握りつぶされて連鎖的に失敗する
      await user.pointer({ keys: "[/MouseLeft]" });
    }
    await expect(args.onJumpToColumn).toHaveBeenCalledWith("multi-1a");
    await expect(args.onReorderColumnGroup).not.toHaveBeenCalled();
  },
};

export const ClickWithoutMoving: Story = {
  name: "動かさずに押して離すとジャンプする",
  args: { columns: multiRowColumns },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const [first] = within(groups[0]).getAllByRole("button");
    await user.click(first);
    await expect(args.onJumpToColumn).toHaveBeenCalledWith("multi-1a");
    await expect(args.onReorderColumnGroup).not.toHaveBeenCalled();
  },
};

export const CloseByClickInExpanded: Story = {
  name: "展開表示で閉じるボタンをその場でクリックするとカラムが閉じる",
  args: { columns: multiRowColumns, expanded: true },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    const [closeButton] = within(groups[0]).getAllByLabelText("カラムを閉じる");
    await user.click(closeButton);
    await expect(args.onClose).toHaveBeenCalledWith("multi-1a");
    await expect(args.onReorderColumnGroup).not.toHaveBeenCalled();
  },
};

// gridRow=0 / gridCol=0 のカラムはグリッド未割当（並び替え対象外）
const columnsWithUnassigned: Column[] = [
  ...columns,
  {
    ...columns[0],
    id: "unassigned-1",
    pageType: "search",
    searchQuery: "unassigned",
    order: 2,
    gridRow: 0,
    gridCol: 0,
  },
];

export const UnassignedColumnNotDraggable: Story = {
  name: "未割当カラムはドラッグしても並び替えられない",
  args: { columns: columnsWithUnassigned },
  play: async ({ canvasElement, args }) => {
    await prepareStory(args);
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const groups = canvas.getAllByTestId("topbar-column-group");
    // 未割当カラムのボタンはどの列グループにも含まれない
    const unassignedButton = canvas
      .getAllByTitle(/アカウント1 - /)
      .find((button) => !button.closest('[data-testid="topbar-column-group"]'));
    await expect(unassignedButton).toBeDefined();
    const [to] = within(groups[0]).getAllByRole("button");
    await dragOver(user, unassignedButton!, to);
    await user.pointer({ keys: "[/MouseLeft]" });
    await expect(args.onReorderColumnGroup).not.toHaveBeenCalled();
    // どのグループもドラッグ状態にならない
    for (const group of groups) {
      await expect(group).not.toHaveAttribute("data-dragging");
    }
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

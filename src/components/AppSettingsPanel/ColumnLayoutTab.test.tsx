import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Account, Column } from "../../types";
import { ColumnLayoutTab } from "./ColumnLayoutTab";

const baseSettings = {
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

const mockAccounts: Account[] = [
  {
    id: "acc-1",
    label: "テストアカウント",
    dataDirectory: "/data",
    color: "#1d9bf0",
    createdAt: "2026-05-03T00:00:00Z",
  },
];

const mockColumns: Column[] = [
  {
    id: "c1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
  },
  {
    id: "c2",
    accountId: "acc-1",
    pageType: "notifications",
    width: 350,
    order: 1,
    gridRow: 1,
    gridCol: 2,
    heightMode: "auto",
    settings: baseSettings,
  },
];

// 縦積みグループのテスト用データ: c1, c2 が gridCol=1 に縦積み、c3 が gridCol=2
const mockColumnsWithStack: Column[] = [
  {
    id: "c1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
  },
  {
    id: "c2",
    accountId: "acc-1",
    pageType: "notifications",
    width: 350,
    order: 1,
    gridRow: 2,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
  },
  {
    id: "c3",
    accountId: "acc-1",
    pageType: "search",
    searchQuery: "test",
    width: 350,
    order: 2,
    gridRow: 1,
    gridCol: 2,
    heightMode: "auto",
    settings: baseSettings,
  },
];

function assertOrderMatchesGrid(columns: Column[]) {
  const assigned = columns.filter((c) => c.gridCol >= 1 && c.gridRow >= 1);
  const byGrid = [...assigned].sort((a, b) =>
    a.gridCol !== b.gridCol ? a.gridCol - b.gridCol : a.gridRow - b.gridRow,
  );
  const byOrder = [...assigned].sort((a, b) => a.order - b.order);
  expect(byOrder.map((c) => c.id)).toEqual(byGrid.map((c) => c.id));
}

describe("ColumnLayoutTab", () => {
  it("グリッドプレビューにカラムが表示される", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const grid = screen.getByTestId("grid-preview");
    expect(
      within(grid).getByText("テストアカウント - ホーム"),
    ).toBeInTheDocument();
    expect(
      within(grid).getByText("テストアカウント - 通知"),
    ).toBeInTheDocument();
  });

  it("セルをクリックして高さ設定が表示される", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const grid = screen.getByTestId("grid-preview");
    fireEvent.click(within(grid).getByText("テストアカウント - ホーム"));
    expect(screen.getByText(/高さ設定/)).toBeInTheDocument();
  });

  it("適用ボタンでonApplyが呼ばれる", () => {
    const onApply = vi.fn();
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("適用"));
    expect(onApply).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "c1" })]),
    );
  });

  it("×ボタンで割り当てを解除すると未割当リストに移動する", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const removeButtons = screen.getAllByLabelText("割り当て解除");
    fireEvent.click(removeButtons[0]);
    expect(screen.getByText("未割当")).toBeInTheDocument();
  });

  it("割当済みセルでEnterキー押下時に選択され高さ設定が表示される", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const grid = screen.getByTestId("grid-preview");
    const cell = within(grid)
      .getByText("テストアカウント - ホーム")
      .closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(screen.getByText(/高さ設定/)).toBeInTheDocument();
  });

  it("割当済みセルでSpaceキー押下時に選択され高さ設定が表示される", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const grid = screen.getByTestId("grid-preview");
    const cell = within(grid)
      .getByText("テストアカウント - 通知")
      .closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(cell, { key: " " });
    expect(screen.getByText(/高さ設定/)).toBeInTheDocument();
  });

  it("未割当アイテムはpendingCellが無いとき無効なボタンである", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // c1 を解除して未割当に移動
    const removeButtons = screen.getAllByLabelText("割り当て解除");
    fireEvent.click(removeButtons[0]);
    const unassignedSection = screen.getByText("未割当").parentElement!;
    const itemButton = within(unassignedSection).getByRole("button", {
      name: /テストアカウント/,
    });
    expect(itemButton).toBeDisabled();
  });

  it("空セル選択後に未割当アイテムボタンをクリックすると割り当てられる", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // c1 を解除して未割当に移動
    const removeButtons = screen.getAllByLabelText("割り当て解除");
    fireEvent.click(removeButtons[0]);
    // 行を追加して空セルを pending にする
    fireEvent.click(screen.getAllByText("+ 行を追加")[0]);
    const unassignedSection = screen.getByText("未割当").parentElement!;
    const itemButton = within(unassignedSection).getByRole("button", {
      name: /テストアカウント/,
    });
    expect(itemButton).not.toBeDisabled();
    fireEvent.click(itemButton);
    // 割り当てられて未割当リストから消える
    expect(
      within(screen.getByText("未割当").parentElement!).queryByRole("button", {
        name: /テストアカウント/,
      }),
    ).not.toBeInTheDocument();
  });
});

describe("ColumnLayoutTab カラム順序", () => {
  it("表示順序セクションが存在する", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("表示順序")).toBeInTheDocument();
  });

  it("縦積みのないケースでは各カラムが個別エントリとして表示される", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const list = screen.getByTestId("order-list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("縦積みグループが1エントリとして表示される", () => {
    // c1, c2 が gridCol=1 に縦積み → グループ1、c3 が gridCol=2 → グループ2
    render(
      <ColumnLayoutTab
        columns={mockColumnsWithStack}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const list = screen.getByTestId("order-list");
    // グループ数 = 2（gridCol=1 のグループ、gridCol=2 のグループ）
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("先頭グループの上へボタンは無効", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const upButtons = screen.getAllByLabelText("上へ");
    expect(upButtons[0]).toBeDisabled();
  });

  it("末尾グループの下へボタンは無効", () => {
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const downButtons = screen.getAllByLabelText("下へ");
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
  });

  it("下へボタンでgridCol値が入れ替わり適用するとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    const downButtons = screen.getAllByLabelText("下へ");
    fireEvent.click(downButtons[0]);
    fireEvent.click(screen.getByText("適用"));
    const calledWith = onApply.mock.calls[0][0] as Column[];
    const c1 = calledWith.find((c) => c.id === "c1")!;
    const c2 = calledWith.find((c) => c.id === "c2")!;
    // c1 が後ろに移動 → c1.gridCol > c2.gridCol
    expect(c1.gridCol).toBeGreaterThan(c2.gridCol);
  });

  it("上へボタンでgridCol値が入れ替わり適用するとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    const upButtons = screen.getAllByLabelText("上へ");
    fireEvent.click(upButtons[1]);
    fireEvent.click(screen.getByText("適用"));
    const calledWith = onApply.mock.calls[0][0] as Column[];
    const c1 = calledWith.find((c) => c.id === "c1")!;
    const c2 = calledWith.find((c) => c.id === "c2")!;
    // c2 が前に移動 → c2.gridCol < c1.gridCol
    expect(c2.gridCol).toBeLessThan(c1.gridCol);
  });

  it("グループ移動後にorder値がgridCol順に正規化される", () => {
    const onApply = vi.fn();
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    const downButtons = screen.getAllByLabelText("下へ");
    fireEvent.click(downButtons[0]);
    fireEvent.click(screen.getByText("適用"));
    const calledWith = onApply.mock.calls[0][0] as Column[];
    const c1 = calledWith.find((c) => c.id === "c1")!;
    const c2 = calledWith.find((c) => c.id === "c2")!;
    // c2 が先頭 → order が小さい
    expect(c2.order).toBeLessThan(c1.order);
  });

  it("縦積みグループを下へ移動すると全メンバーのgridColが変わる", () => {
    const onApply = vi.fn();
    render(
      <ColumnLayoutTab
        columns={mockColumnsWithStack}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    // グループ1（gridCol=1, c1+c2）を下へ移動
    const downButtons = screen.getAllByLabelText("下へ");
    fireEvent.click(downButtons[0]);
    fireEvent.click(screen.getByText("適用"));
    const calledWith = onApply.mock.calls[0][0] as Column[];
    const c1 = calledWith.find((c) => c.id === "c1")!;
    const c2 = calledWith.find((c) => c.id === "c2")!;
    const c3 = calledWith.find((c) => c.id === "c3")!;
    // c1, c2 はグループとして一緒に移動 → c1, c2 の gridCol > c3 の gridCol
    expect(c1.gridCol).toBeGreaterThan(c3.gridCol);
    expect(c2.gridCol).toBeGreaterThan(c3.gridCol);
    // c1 と c2 は同じ gridCol
    expect(c1.gridCol).toBe(c2.gridCol);
  });

  it("セルに割り当てるとorderがgridCol順gridRow順に再計算される", () => {
    const onApply = vi.fn();
    // c3 は最初から未割当（order=2）。c1(gridCol1,order0)・c2(gridCol2,order1) はそのまま。
    // c3 を列1（既にc1がいる列）の行2へ割り当てると、grid順は c1,c3,c2 となり
    // 既存order(0,1,2 = c1,c2,c3)とズレる。正規化されて初めて一致する
    const localColumns: Column[] = [
      ...mockColumns,
      {
        id: "c3",
        accountId: "acc-1",
        pageType: "search",
        searchQuery: "test",
        width: 350,
        order: 2,
        gridRow: 0,
        gridCol: 0,
        heightMode: "auto",
        settings: baseSettings,
      },
    ];
    render(
      <ColumnLayoutTab
        columns={localColumns}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    // 列1に「+ 行を追加」して空セルを pending にする（列1の行2）
    fireEvent.click(screen.getAllByText("+ 行を追加")[0]);
    const unassignedSection = screen.getByText("未割当").parentElement!;
    const itemButton = within(unassignedSection).getByRole("button", {
      name: /テストアカウント/,
    });
    fireEvent.click(itemButton);
    fireEvent.click(screen.getByText("適用"));
    const calledWith = onApply.mock.calls[0][0] as Column[];
    assertOrderMatchesGrid(calledWith);
  });

  it("割り当てを解除するとorderが再計算され解除したカラムが末尾になる", () => {
    const onApply = vi.fn();
    render(
      <ColumnLayoutTab
        columns={mockColumns}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    const removeButtons = screen.getAllByLabelText("割り当て解除");
    fireEvent.click(removeButtons[0]);
    fireEvent.click(screen.getByText("適用"));
    const calledWith = onApply.mock.calls[0][0] as Column[];
    const c1 = calledWith.find((c) => c.id === "c1")!;
    const c2 = calledWith.find((c) => c.id === "c2")!;
    expect(c1.order).toBeGreaterThan(c2.order);
  });

  it("列数を減らして範囲外になったカラムのorderが末尾になる", () => {
    const onApply = vi.fn();
    // order をあえて gridCol と逆転させた入力（既存データの不整合を模す）。
    // 初期draftの正規化が効いていれば、これは c1=order0 / c2=order1 に修復されるはず
    const localColumns: Column[] = [
      { ...mockColumns[0], order: 5 },
      { ...mockColumns[1], order: 0 },
    ];
    render(
      <ColumnLayoutTab
        columns={localColumns}
        accounts={mockAccounts}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByText("適用"));
    const calledWith = onApply.mock.calls[0][0] as Column[];
    const c1 = calledWith.find((c) => c.id === "c1")!;
    const c2 = calledWith.find((c) => c.id === "c2")!;
    expect(c2.gridCol).toBe(0);
    expect(c2.order).toBeGreaterThan(c1.order);
  });
});

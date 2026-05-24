import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import type { Account, Column } from "../../types";

const baseSettings = {
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
});

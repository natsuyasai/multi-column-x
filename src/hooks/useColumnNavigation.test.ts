import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import type { ColumnBounds } from "@/lib/gridLayout";
import { evalInColumn } from "@/services/columnWebview";
import { useAppStore } from "@/store/useAppStore";
import type { Column } from "@/types";
import { useColumnNavigation } from "./useColumnNavigation";

vi.mock("@/services/columnWebview", () => ({
  evalInColumn: vi.fn().mockResolvedValue(undefined),
}));

const makeColumn = (id: string, order: number): Column =>
  ({ id, order }) as Column;

const bounds = (x: number): ColumnBounds => ({
  x,
  y: 0,
  width: 300,
  height: 600,
});

interface Props {
  columns: Column[];
  columnBounds: Record<string, ColumnBounds>;
  dialogOpen: boolean;
}

const setup = (initial: Props) => {
  const scrollbar = { scrollLeft: 0 } as HTMLDivElement;
  const scrollbarRef = { current: scrollbar };
  const hook = renderHook(
    (props: Props) => useColumnNavigation({ ...props, scrollbarRef }),
    { initialProps: initial },
  );
  return { scrollbar, ...hook };
};

describe("useColumnNavigation の保留ジャンプ", () => {
  beforeEach(() => {
    vi.mocked(evalInColumn).mockClear();
  });

  it("デスクトップでカラムを追加すると新カラムの位置へ横スクロールが移動する", () => {
    const old = makeColumn("old", 0);
    const { scrollbar, result, rerender } = setup({
      columns: [old],
      columnBounds: { old: bounds(0) },
      dialogOpen: false,
    });

    act(() => {
      result.current.jumpToColumnWhenReady("new");
    });
    rerender({
      columns: [old],
      columnBounds: { old: bounds(0) },
      dialogOpen: false,
    });
    expect(scrollbar.scrollLeft).toBe(0);

    rerender({
      columns: [old, makeColumn("new", 1)],
      columnBounds: { old: bounds(0), new: bounds(320) },
      dialogOpen: false,
    });
    expect(scrollbar.scrollLeft).toBe(320);
  });

  it("デスクトップでカラムを追加すると新カラムがフォーカスカラムになる", () => {
    const old = makeColumn("old", 0);
    const added = makeColumn("new", 1);
    const { result, rerender } = setup({
      columns: [old],
      columnBounds: { old: bounds(0) },
      dialogOpen: false,
    });

    act(() => {
      result.current.jumpToColumnWhenReady("new");
    });
    rerender({
      columns: [old, added],
      columnBounds: { old: bounds(0), new: bounds(320) },
      dialogOpen: false,
    });
    result.current.handleReloadFocusedColumn();

    expect(evalInColumn).toHaveBeenCalledWith(
      "new",
      WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
    );
  });

  it("ダイアログが開いている間は新カラムへのジャンプを保留し閉じたら実行する", () => {
    const old = makeColumn("old", 0);
    const columns = [old, makeColumn("new", 1)];
    const columnBounds = { old: bounds(0), new: bounds(320) };
    const { scrollbar, result, rerender } = setup({
      columns,
      columnBounds,
      dialogOpen: true,
    });

    act(() => {
      result.current.jumpToColumnWhenReady("new");
    });
    rerender({ columns, columnBounds, dialogOpen: true });
    expect(scrollbar.scrollLeft).toBe(0);

    rerender({ columns, columnBounds, dialogOpen: false });
    expect(scrollbar.scrollLeft).toBe(320);
  });

  it("プリセット読込やカラム復元ではアクティブなカラムが変わらない", () => {
    const old = makeColumn("old", 0);
    const { scrollbar, result, rerender } = setup({
      columns: [old],
      columnBounds: { old: bounds(0) },
      dialogOpen: false,
    });

    rerender({
      columns: [old, makeColumn("restored", 1)],
      columnBounds: { old: bounds(0), restored: bounds(320) },
      dialogOpen: false,
    });
    result.current.handleReloadFocusedColumn();

    expect(scrollbar.scrollLeft).toBe(0);
    expect(evalInColumn).toHaveBeenCalledWith(
      "old",
      WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
    );
  });

  it("保留ジャンプは1回だけ実行され以降の再描画で再加算されない", () => {
    const old = makeColumn("old", 0);
    const columns = [old, makeColumn("new", 1)];
    const { scrollbar, result, rerender } = setup({
      columns: [old],
      columnBounds: { old: bounds(0) },
      dialogOpen: false,
    });

    act(() => {
      result.current.jumpToColumnWhenReady("new");
    });
    rerender({
      columns,
      columnBounds: { old: bounds(0), new: bounds(320) },
      dialogOpen: false,
    });
    expect(scrollbar.scrollLeft).toBe(320);

    rerender({
      columns,
      columnBounds: { old: bounds(0), new: bounds(330) },
      dialogOpen: false,
    });
    expect(scrollbar.scrollLeft).toBe(320);
  });
});

describe("useColumnNavigation の全カラム再読み込み", () => {
  const col = (id: string, pageType: Column["pageType"] = "home"): Column =>
    ({ id, order: 0, pageType }) as Column;

  const setupAll = (columns: Column[]) =>
    renderHook(() =>
      useColumnNavigation({
        columns,
        columnBounds: {},
        scrollbarRef: { current: null },
        dialogOpen: false,
      }),
    );

  beforeEach(() => {
    vi.mocked(evalInColumn).mockReset();
    vi.mocked(evalInColumn).mockResolvedValue(undefined);
    useAppStore.setState({ restoreInProgress: false, reloadAllSignal: 0 });
  });

  it("全カラム再読み込みボタンを押すと全カラムが更新される", async () => {
    const { result } = setupAll([col("A"), col("B"), col("C")]);

    await act(async () => {
      await result.current.handleReloadAll();
    });

    expect(evalInColumn).toHaveBeenCalledTimes(3);
    for (const id of ["A", "B", "C"]) {
      expect(evalInColumn).toHaveBeenCalledWith(
        id,
        WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
      );
    }
  });

  it("全カラム再読み込みボタンを押すと各カラムの自動更新カウントダウンが振り直される", async () => {
    const { result } = setupAll([col("A"), col("B")]);

    await act(async () => {
      await result.current.handleReloadAll();
    });

    expect(useAppStore.getState().reloadAllSignal).toBe(1);
  });

  it("外部サイトカラムは全カラム再読み込みの対象外である", async () => {
    const { result } = setupAll([col("A"), col("X", "external"), col("C")]);

    await act(async () => {
      await result.current.handleReloadAll();
    });

    expect(evalInColumn).toHaveBeenCalledTimes(2);
    expect(evalInColumn).not.toHaveBeenCalledWith("X", expect.anything());
    expect(evalInColumn).toHaveBeenCalledWith(
      "A",
      WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
    );
    expect(evalInColumn).toHaveBeenCalledWith(
      "C",
      WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
    );
  });

  it("一部のカラムの更新に失敗しても残りのカラムは更新される", async () => {
    vi.mocked(evalInColumn).mockImplementation(async (id: string) => {
      if (id === "B") throw new Error("失敗");
    });
    const { result } = setupAll([col("A"), col("B"), col("C")]);

    await act(async () => {
      await expect(result.current.handleReloadAll()).resolves.toBeUndefined();
    });

    expect(evalInColumn).toHaveBeenCalledWith(
      "A",
      WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
    );
    expect(evalInColumn).toHaveBeenCalledWith(
      "C",
      WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
    );
    expect(useAppStore.getState().reloadAllSignal).toBe(1);
  });

  it("バックアップ復元中は全カラム再読み込みボタンを押しても何も更新されない", async () => {
    useAppStore.setState({ restoreInProgress: true });
    const { result } = setupAll([col("A"), col("B")]);

    await act(async () => {
      await result.current.handleReloadAll();
    });

    expect(evalInColumn).not.toHaveBeenCalled();
    expect(useAppStore.getState().reloadAllSignal).toBe(0);
  });

  it("カラムが1つもないとき全カラム再読み込みボタンを押しても何も起きない", async () => {
    const { result } = setupAll([]);

    await act(async () => {
      await result.current.handleReloadAll();
    });

    expect(evalInColumn).not.toHaveBeenCalled();
    expect(useAppStore.getState().reloadAllSignal).toBe(0);
  });
});

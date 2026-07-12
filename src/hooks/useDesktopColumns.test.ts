import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IPC_COMMANDS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "../types";
import { useDesktopColumns } from "./useDesktopColumns";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// Linux 専用のウィンドウ移動追従 useEffect（platform() !== "linux" で早期 return）を
// 通過させるためのモック。ここでは Windows/Mac 相当の挙動のみを検証対象とする。
vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "windows"),
}));

const mockInvoke = vi.mocked(invoke);

/** clientHeight を固定した div を持つ RefObject を作る（jsdom は clientHeight を計測しないため）。 */
function makeContainerRef(clientHeight: number) {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientHeight", {
    value: clientHeight,
    configurable: true,
  });
  return { current: div };
}

/** scrollLeft を固定した div を持つ RefObject を作る。 */
function makeScrollbarRef(scrollLeft = 0) {
  const div = document.createElement("div");
  Object.defineProperty(div, "scrollLeft", {
    value: scrollLeft,
    configurable: true,
    writable: true,
  });
  return { current: div };
}

const account1 = {
  id: "acc-1",
  label: "Account1",
  dataDirectory: "/data/acc-1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeColumn(
  overrides: Partial<Column> & Pick<Column, "id" | "gridCol">,
): Column {
  return {
    accountId: "acc-1",
    pageType: "home",
    homeTabName: "フォロー中",
    width: 350,
    order: overrides.gridCol - 1,
    gridRow: 1,
    heightMode: "auto",
    settings: { ...DEFAULT_COLUMN_SETTINGS },
    ...overrides,
  };
}

function renderDesktopColumns(opts?: {
  containerHeight?: number | null;
  dialogOpen?: boolean;
  activeColumnId?: string | null;
  setActiveColumn?: (id: string) => Promise<void>;
}) {
  const containerRef =
    opts?.containerHeight === null
      ? { current: null }
      : makeContainerRef(opts?.containerHeight ?? 900);
  const scrollbarRef = makeScrollbarRef(0);
  const dialogOpenRef = { current: opts?.dialogOpen ?? false };
  return renderHook(() =>
    useDesktopColumns({
      containerRef,
      scrollbarRef,
      dialogOpenRef,
      activeColumnId: opts?.activeColumnId ?? null,
      setActiveColumn:
        opts?.setActiveColumn ?? vi.fn().mockResolvedValue(undefined),
    }),
  );
}

describe("useDesktopColumns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({
      accounts: [account1],
      columns: [
        makeColumn({ id: "col-1", gridCol: 1 }),
        makeColumn({ id: "col-2", gridCol: 2 }),
      ],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ウィンドウリサイズは100msデバウンス後に全カラムを再配置する", () => {
    vi.useFakeTimers();
    renderDesktopColumns();
    mockInvoke.mockClear();

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 50ms 時点ではまだデバウンス中のため再配置されない
    expect(
      mockInvoke.mock.calls.filter(
        (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
      ),
    ).toHaveLength(0);

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 2回目のイベントでタイマーがリセットされるため、まだ100ms経過していない
    expect(
      mockInvoke.mock.calls.filter(
        (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
      ),
    ).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    // 2回目のイベントから100ms経過したので、両カラムが再配置される
    const resizeCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
    );
    expect(resizeCalls).toHaveLength(2);
  });

  it("ダイアログ表示中のウィンドウリサイズでは再配置しない", () => {
    vi.useFakeTimers();
    renderDesktopColumns({ dialogOpen: true });
    mockInvoke.mockClear();

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("スクロールバー操作は1フレームに1回だけ再配置する", () => {
    // CLAUDE.md「Linux WebProcess クラッシュ対策」の予防層のデグレ検知が目的。
    // 横スクロールで resize_column_webview（Linux では WebviewWindow 再配置）が
    // 連続発火すると WebKitGTK の WebProcess が高負荷でクラッシュしうるため、
    // rafThrottle により 1 フレームに 1 回へ間引く仕様をここで固定する。
    vi.useFakeTimers();
    const { result } = renderDesktopColumns();
    mockInvoke.mockClear();

    act(() => {
      result.current.handleScrollbarScroll();
      result.current.handleScrollbarScroll();
      result.current.handleScrollbarScroll();
    });

    // rAF が発火するまでは再配置されない
    expect(mockInvoke).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersToNextFrame();
    });

    const resizeCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
    );
    // 3回スクロールイベントを発火させても、rAFで1フレームに集約されるため
    // 再配置はカラム数分（2）のみ。間引きが壊れると 3 倍（6回）になる。
    expect(resizeCalls).toHaveLength(2);
  });

  it("restoreDesktopColumnsはカラムごとにWebViewを作成し最後に全体を再配置する", async () => {
    const { result } = renderDesktopColumns();
    const columns = [
      makeColumn({ id: "col-1", gridCol: 1 }),
      makeColumn({ id: "col-2", gridCol: 2 }),
    ];

    await act(async () => {
      await result.current.restoreDesktopColumns(
        columns,
        [account1],
        900,
        0,
        32,
      );
    });

    const commandSequence = mockInvoke.mock.calls.map((c) => c[0]);
    const createCalls = commandSequence.filter(
      (cmd) => cmd === IPC_COMMANDS.CREATE_COLUMN_WEBVIEW,
    );
    expect(createCalls).toHaveLength(2);

    const lastCreateIdx = commandSequence.lastIndexOf(
      IPC_COMMANDS.CREATE_COLUMN_WEBVIEW,
    );
    const firstResizeIdx = commandSequence.indexOf(
      IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
    );
    // 全カラム作成後に recalculateAllBounds による再配置が続く
    expect(firstResizeIdx).toBeGreaterThan(lastCreateIdx);
  });

  it("アカウントが見つからないカラムはWebViewを作成しない", async () => {
    const { result } = renderDesktopColumns();
    const orphanColumn = makeColumn({
      id: "col-orphan",
      gridCol: 1,
      accountId: "acc-missing",
    });

    await act(async () => {
      await result.current.restoreDesktopColumns(
        [orphanColumn],
        [account1],
        900,
        0,
        32,
      );
    });

    expect(
      mockInvoke.mock.calls.filter(
        (c) => c[0] === IPC_COMMANDS.CREATE_COLUMN_WEBVIEW,
      ),
    ).toHaveLength(0);
  });
});

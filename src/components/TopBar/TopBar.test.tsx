import type { DragEndEvent } from "@dnd-kit/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Column, Account } from "../../types";
import { TopBar } from "./TopBar";

// jsdom では getBoundingClientRect が全て 0 となり実 D&D の衝突判定が成立しないため、
// DndContext に渡された onDragEnd を捕捉して、ドロップ結果を直接流し込む。
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dnd.onDragEnd = props.onDragEnd;
      return createElement(actual.DndContext, props);
    },
  };
});

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 600,
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

const acc1: Account = {
  id: "acc-1",
  label: "アカウント1",
  dataDirectory: "/data/1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

const col1: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: baseSettings,
};

const col2: Column = {
  id: "col-2",
  accountId: "acc-1",
  pageType: "notifications",
  width: 350,
  order: 1,
  gridRow: 1,
  gridCol: 2,
  heightMode: "auto",
  settings: baseSettings,
};

const defaultProps = {
  columns: [col1, col2],
  accounts: [acc1],
  expanded: false,
  onToggleExpand: vi.fn(),
  onAddColumn: vi.fn(),
  onAccountManager: vi.fn(),
  onAppSettings: vi.fn(),
  onComposeTweet: vi.fn(),
  onOpenLinkPopup: vi.fn(),
  onJumpToColumn: vi.fn(),
  onClose: vi.fn(),
  onReorderColumnGroup: vi.fn(),
  apiRateLimitMonitorEnabled: true,
  apiRateLimits: {},
  onApiRateLimitPopoverOpenChange: vi.fn(),
};

describe("TopBar", () => {
  it("ツイート作成ボタンをクリックすると onComposeTweet が呼ばれる", async () => {
    const onComposeTweet = vi.fn();
    render(<TopBar {...defaultProps} onComposeTweet={onComposeTweet} />);
    await userEvent.click(screen.getByTitle("ツイートを作成 (Ctrl+T)"));
    expect(onComposeTweet).toHaveBeenCalled();
  });

  it("カラムジャンプボタンが各カラム分表示され、クリックで onJumpToColumn が呼ばれる", async () => {
    const onJump = vi.fn();
    render(<TopBar {...defaultProps} onJumpToColumn={onJump} />);
    const buttons = screen.getAllByTitle(/.+ - (ホーム|通知)/);
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);
    expect(onJump).toHaveBeenCalledWith("col-2");
  });

  it("URLを開くボタンをクリックすると onOpenLinkPopup が呼ばれる", async () => {
    const onOpen = vi.fn();
    render(<TopBar {...defaultProps} onOpenLinkPopup={onOpen} />);
    await userEvent.click(
      screen.getByTitle("URLをポップアップで開く (Ctrl+L)"),
    );
    expect(onOpen).toHaveBeenCalled();
  });

  it("カラム追加ボタンをクリックすると onAddColumn が呼ばれる", async () => {
    const onAdd = vi.fn();
    render(<TopBar {...defaultProps} onAddColumn={onAdd} />);
    await userEvent.click(screen.getByTitle("カラムを追加 (Ctrl+N)"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("アカウント管理ボタンをクリックすると onAccountManager が呼ばれる", async () => {
    const onAcc = vi.fn();
    render(<TopBar {...defaultProps} onAccountManager={onAcc} />);
    await userEvent.click(screen.getByTitle("アカウント管理 (Ctrl+Shift+A)"));
    expect(onAcc).toHaveBeenCalled();
  });

  it("設定ボタンをクリックすると onAppSettings が呼ばれる", async () => {
    const onSet = vi.fn();
    render(<TopBar {...defaultProps} onAppSettings={onSet} />);
    await userEvent.click(screen.getByTitle("アプリ設定 (Ctrl+,)"));
    expect(onSet).toHaveBeenCalled();
  });

  it("展開トグルをクリックすると onToggleExpand が呼ばれる", async () => {
    const onToggle = vi.fn();
    render(<TopBar {...defaultProps} onToggleExpand={onToggle} />);
    await userEvent.click(screen.getByTitle("ツールバーを展開 (Ctrl+B)"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("expanded=true のときカラムリスト行（行2）が表示される", () => {
    const { container, rerender } = render(
      <TopBar {...defaultProps} expanded={false} />,
    );
    const collapsedRow2 = container.querySelector(
      '[data-testid="topbar-row2"]',
    );
    expect(collapsedRow2).toBeNull();
    rerender(<TopBar {...defaultProps} expanded={true} />);
    const expandedRow2 = container.querySelector('[data-testid="topbar-row2"]');
    expect(expandedRow2).not.toBeNull();
  });

  it("expanded=true のとき展開トグルのタイトルが「折りたたむ」になる", () => {
    render(<TopBar {...defaultProps} expanded={true} />);
    expect(
      screen.getByTitle("ツールバーを折りたたむ (Ctrl+B)"),
    ).toBeInTheDocument();
  });

  it("カラムにカスタムラベルがある場合はそれが title 属性に出る", () => {
    const labeled: Column = { ...col1, label: "マイホーム" };
    render(<TopBar {...defaultProps} columns={[labeled]} />);
    expect(screen.getByTitle("マイホーム (Ctrl+1)")).toBeInTheDocument();
  });

  it("apiRateLimitMonitorEnabledがtrueのときAPIレート制限インジケータが表示される", () => {
    render(<TopBar {...defaultProps} apiRateLimitMonitorEnabled={true} />);
    expect(screen.getByLabelText("APIレート制限")).toBeInTheDocument();
  });

  it("apiRateLimitMonitorEnabledがfalseのときAPIレート制限インジケータが表示されない", () => {
    render(<TopBar {...defaultProps} apiRateLimitMonitorEnabled={false} />);
    expect(screen.queryByLabelText("APIレート制限")).not.toBeInTheDocument();
  });

  it("APIレート制限インジケータの開閉状態が変化するとonApiRateLimitPopoverOpenChangeが呼ばれる", async () => {
    const onApiRateLimitPopoverOpenChange = vi.fn();
    render(
      <TopBar
        {...defaultProps}
        onApiRateLimitPopoverOpenChange={onApiRateLimitPopoverOpenChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("APIレート制限"));
    expect(onApiRateLimitPopoverOpenChange).toHaveBeenCalledWith(true);
  });

  it("expanded=true のとき各カラムにカラムを閉じるボタンが表示される", () => {
    const { container } = render(<TopBar {...defaultProps} expanded={true} />);
    expect(
      container
        .querySelector('[title="カラムを閉じる"]')
        ?.querySelector('[data-testid="icon-close"]'),
    ).toBeInTheDocument();
  });

  describe("アクションボタンの SVG アイコン", () => {
    it("ツイートボタンに pencil SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="ツイートを作成 (Ctrl+T)"]')
          ?.querySelector('[data-testid="icon-pencil"]'),
      ).toBeInTheDocument();
    });

    it("URL ポップアップボタンに link SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="URLをポップアップで開く (Ctrl+L)"]')
          ?.querySelector('[data-testid="icon-link"]'),
      ).toBeInTheDocument();
    });

    it("カラム追加ボタンに plus SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="カラムを追加 (Ctrl+N)"]')
          ?.querySelector('[data-testid="icon-plus"]'),
      ).toBeInTheDocument();
    });

    it("アカウント管理ボタンに person SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="アカウント管理 (Ctrl+Shift+A)"]')
          ?.querySelector('[data-testid="icon-person"]'),
      ).toBeInTheDocument();
    });

    it("アプリ設定ボタンに settings SVG が表示される", () => {
      const { container } = render(<TopBar {...defaultProps} />);
      expect(
        container
          .querySelector('[title="アプリ設定 (Ctrl+,)"]')
          ?.querySelector('[data-testid="icon-settings"]'),
      ).toBeInTheDocument();
    });
  });

  describe("pageTypeがexternalのときのラベル", () => {
    it("customUrlがある場合はホスト名を含むラベルがtitleに出る", () => {
      const externalCol: Column = {
        ...col1,
        pageType: "external",
        customUrl: "https://example.com/path",
      };
      render(<TopBar {...defaultProps} columns={[externalCol]} />);
      expect(
        screen.getByTitle("アカウント1 - 外部: example.com (Ctrl+1)"),
      ).toBeInTheDocument();
    });

    it("customUrlがない場合は外部サイトがtitleに出る", () => {
      const externalCol: Column = {
        ...col1,
        pageType: "external",
      };
      render(<TopBar {...defaultProps} columns={[externalCol]} />);
      expect(
        screen.getByTitle("アカウント1 - 外部サイト (Ctrl+1)"),
      ).toBeInTheDocument();
    });

    it("customUrlが不正な形式の場合は外部サイトがtitleに出る", () => {
      const externalCol: Column = {
        ...col1,
        pageType: "external",
        customUrl: "not-a-url",
      };
      render(<TopBar {...defaultProps} columns={[externalCol]} />);
      expect(
        screen.getByTitle("アカウント1 - 外部サイト (Ctrl+1)"),
      ).toBeInTheDocument();
    });
  });

  describe("列単位表示（複数行の列）", () => {
    // gridCol=1 に 2 行（col-a, col-b）、gridCol=2 に 1 行（col-c）
    const colA: Column = {
      ...col1,
      id: "col-a",
      pageType: "home",
      order: 0,
      gridRow: 1,
      gridCol: 1,
    };
    const colB: Column = {
      ...col1,
      id: "col-b",
      pageType: "notifications",
      order: 1,
      gridRow: 2,
      gridCol: 1,
    };
    const colC: Column = {
      ...col1,
      id: "col-c",
      pageType: "search",
      order: 2,
      gridRow: 1,
      gridCol: 2,
    };
    const multiRowColumns = [colA, colB, colC];

    it.each([false, true])(
      "同じ列の複数行カラムが1つの列グループ要素にまとまる（expanded=%s）",
      (expanded) => {
        render(
          <TopBar
            {...defaultProps}
            columns={multiRowColumns}
            expanded={expanded}
          />,
        );
        const groups = screen.getAllByTestId("topbar-column-group");
        expect(groups).toHaveLength(2);
        expect(within(groups[0]).getAllByTitle(/アカウント1 - /)).toHaveLength(
          2,
        );
        expect(within(groups[1]).getAllByTitle(/アカウント1 - /)).toHaveLength(
          1,
        );
      },
    );

    it("列グループ内のカラムはgridRow昇順で並ぶ", () => {
      // 配列順・order は gridRow と逆にしても、列内は gridRow 昇順で表示される
      const upper: Column = { ...colA, order: 5, gridRow: 1 };
      const lower: Column = { ...colB, order: 0, gridRow: 2 };
      render(<TopBar {...defaultProps} columns={[lower, upper]} />);
      const [group] = screen.getAllByTestId("topbar-column-group");
      const titles = within(group)
        .getAllByTitle(/アカウント1 - /)
        .map((el) => el.getAttribute("title"));
      expect(titles[0]).toMatch(/ホーム/);
      expect(titles[1]).toMatch(/通知/);
    });

    it("gridColが飛び番でも列グループはgridCol昇順で並ぶ", () => {
      const left: Column = { ...colA, id: "left", gridCol: 1, order: 1 };
      const right: Column = { ...colC, id: "right", gridCol: 4, order: 0 };
      render(<TopBar {...defaultProps} columns={[right, left]} />);
      const groups = screen.getAllByTestId("topbar-column-group");
      expect(groups).toHaveLength(2);
      expect(within(groups[0]).getByTitle(/ホーム/)).toBeInTheDocument();
      expect(within(groups[1]).getByTitle(/検索/)).toBeInTheDocument();
    });

    it("複数行の列のカラムタイトルのCtrl+Nはorder順の位置に対応する", () => {
      // Ctrl+1〜9 のジャンプ先は order 昇順の index なので、タイトルもそれに合わせる
      render(<TopBar {...defaultProps} columns={multiRowColumns} />);
      expect(screen.getByTitle(/ホーム \(Ctrl\+1\)/)).toBeInTheDocument();
      expect(screen.getByTitle(/通知 \(Ctrl\+2\)/)).toBeInTheDocument();
      expect(screen.getByTitle(/検索: .*\(Ctrl\+3\)/)).toBeInTheDocument();
    });

    it("expanded=true の複数行の列でもカラムごとに閉じるボタンが動作する", async () => {
      const onClose = vi.fn();
      render(
        <TopBar
          {...defaultProps}
          columns={multiRowColumns}
          expanded={true}
          onClose={onClose}
        />,
      );
      const [firstGroup] = screen.getAllByTestId("topbar-column-group");
      const closeButtons = within(firstGroup).getAllByTitle("カラムを閉じる");
      expect(closeButtons).toHaveLength(2);
      await userEvent.click(closeButtons[1]);
      expect(onClose).toHaveBeenCalledWith("col-b");
    });

    it("複数行の列内のカラムをクリックするとそのカラムで onJumpToColumn が呼ばれる", async () => {
      const onJump = vi.fn();
      render(
        <TopBar
          {...defaultProps}
          columns={multiRowColumns}
          onJumpToColumn={onJump}
        />,
      );
      const [firstGroup] = screen.getAllByTestId("topbar-column-group");
      await userEvent.click(within(firstGroup).getByTitle(/通知/));
      expect(onJump).toHaveBeenCalledWith("col-b");
    });
  });

  describe("グループ領域ドラッグ（つまみ廃止・キーボード非対応）", () => {
    const stacked: Column = {
      ...col2,
      id: "col-3",
      gridRow: 2,
      gridCol: 1,
    };

    it.each([false, true])(
      "TopBarにドラッグ用のつまみが表示されない（expanded=%s）",
      (expanded) => {
        render(
          <TopBar
            {...defaultProps}
            columns={[col1, stacked, col2]}
            expanded={expanded}
          />,
        );
        // gridCol=1 の 2 行と gridCol=2 の 1 行 → 列グループは 2 つあるが、つまみはどこにもない
        expect(screen.getAllByTestId("topbar-column-group")).toHaveLength(2);
        expect(screen.queryAllByLabelText("ドラッグして並び替え")).toHaveLength(
          0,
        );
      },
    );

    it("列グループ要素がキーボードの停止位置にならない", async () => {
      const user = userEvent.setup();
      render(
        <TopBar
          {...defaultProps}
          columns={[col1, stacked, col2]}
          expanded={true}
        />,
      );
      const groups = screen.getAllByTestId("topbar-column-group");
      for (const group of groups) {
        expect(group).not.toHaveAttribute("tabindex");
        expect(group).not.toHaveAttribute("role");
      }

      // 全フォーカス可能要素を 1 周以上するだけ Tab を繰り返し、グループ自体にフォーカスが乗らないこと
      const focused = new Set<Element>();
      for (let i = 0; i < 40; i++) {
        await user.tab();
        if (document.activeElement) focused.add(document.activeElement);
      }
      for (const group of groups) {
        expect(focused.has(group)).toBe(false);
      }
      // 一方でグループ内のカラムボタン・閉じるボタンにはフォーカスが止まる
      const columnButton = within(groups[0]).getAllByTitle(/アカウント1 - /)[0];
      const closeButton = within(groups[0]).getAllByTitle("カラムを閉じる")[0];
      expect(focused.has(columnButton)).toBe(true);
      expect(focused.has(closeButton)).toBe(true);
    });

    it("SpaceのあとRight矢印を押してもonReorderColumnGroupは呼ばれない", async () => {
      const user = userEvent.setup();
      const onReorderColumnGroup = vi.fn();
      render(
        <TopBar
          {...defaultProps}
          columns={[col1, col2]}
          onReorderColumnGroup={onReorderColumnGroup}
        />,
      );
      const [firstButton] = screen.getAllByTitle(/アカウント1 - /);
      firstButton.focus();
      await user.keyboard(" ");
      await user.keyboard("{ArrowRight}");
      expect(onReorderColumnGroup).not.toHaveBeenCalled();
    });
  });

  describe("未割当カラム", () => {
    const unassigned: Column = {
      ...col1,
      id: "col-u",
      pageType: "search",
      order: 2,
      gridRow: 0,
      gridCol: 0,
    };

    it.each([false, true])(
      "未割当カラムも従来どおり表示され続ける（expanded=%s）",
      (expanded) => {
        render(
          <TopBar
            {...defaultProps}
            columns={[col1, col2, unassigned]}
            expanded={expanded}
          />,
        );
        expect(screen.getByTitle(/検索: .*\(Ctrl\+3\)/)).toBeInTheDocument();
      },
    );

    it("未割当カラムは列グループ要素を持たない", () => {
      render(<TopBar {...defaultProps} columns={[col1, col2, unassigned]} />);
      expect(screen.getAllByTestId("topbar-column-group")).toHaveLength(2);
      const unassignedButton = screen.getByTitle(/検索/);
      expect(
        unassignedButton.closest('[data-testid="topbar-column-group"]'),
      ).toBeNull();
    });

    it("未割当カラムだけのときは列グループ要素が表示されない", () => {
      render(<TopBar {...defaultProps} columns={[unassigned]} />);
      expect(screen.queryAllByTestId("topbar-column-group")).toHaveLength(0);
      expect(screen.getByTitle(/検索/)).toBeInTheDocument();
    });

    it("未割当カラムをクリックすると onJumpToColumn が呼ばれる", async () => {
      const onJump = vi.fn();
      render(
        <TopBar
          {...defaultProps}
          columns={[col1, unassigned]}
          onJumpToColumn={onJump}
        />,
      );
      await userEvent.click(screen.getByTitle(/検索/));
      expect(onJump).toHaveBeenCalledWith("col-u");
    });
  });

  describe("ドロップ時の並び替え通知", () => {
    beforeEach(() => {
      dnd.onDragEnd = undefined;
    });

    function dragEnd(activeId: string, overId: string | null) {
      const event = {
        active: { id: activeId },
        over: overId === null ? null : { id: overId },
      } as unknown as DragEndEvent;
      dnd.onDragEnd?.(event);
    }

    it("別の列グループの上にドロップすると onReorderColumnGroup が移動元と移動先のindexで呼ばれる", () => {
      const onReorder = vi.fn();
      render(<TopBar {...defaultProps} onReorderColumnGroup={onReorder} />);
      expect(dnd.onDragEnd).toBeDefined();
      dragEnd("col-1", "col-2");
      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenCalledWith(0, 1);
    });

    it("逆方向のドロップでは移動元と移動先のindexが入れ替わって渡る", () => {
      const onReorder = vi.fn();
      render(<TopBar {...defaultProps} onReorderColumnGroup={onReorder} />);
      dragEnd("col-2", "col-1");
      expect(onReorder).toHaveBeenCalledWith(1, 0);
    });

    it("expanded=true でもドロップ時に onReorderColumnGroup が呼ばれる", () => {
      const onReorder = vi.fn();
      render(
        <TopBar
          {...defaultProps}
          expanded={true}
          onReorderColumnGroup={onReorder}
        />,
      );
      dragEnd("col-1", "col-2");
      expect(onReorder).toHaveBeenCalledWith(0, 1);
    });

    it("ドロップ先がない（over が null）場合は onReorderColumnGroup が呼ばれない", () => {
      const onReorder = vi.fn();
      render(<TopBar {...defaultProps} onReorderColumnGroup={onReorder} />);
      dragEnd("col-1", null);
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("同じ列グループの上にドロップした場合は onReorderColumnGroup が呼ばれない", () => {
      const onReorder = vi.fn();
      render(<TopBar {...defaultProps} onReorderColumnGroup={onReorder} />);
      dragEnd("col-1", "col-1");
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("存在しないidのドロップでは onReorderColumnGroup が呼ばれない", () => {
      const onReorder = vi.fn();
      render(<TopBar {...defaultProps} onReorderColumnGroup={onReorder} />);
      dragEnd("unknown", "col-2");
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("複数行の列は先頭カラムidで解決され列グループ単位のindexで通知される", () => {
      const top: Column = { ...col1, id: "col-top", gridRow: 1, gridCol: 1 };
      const bottom: Column = {
        ...col1,
        id: "col-bottom",
        order: 1,
        gridRow: 2,
        gridCol: 1,
      };
      const right: Column = { ...col2, id: "col-right", order: 2, gridCol: 2 };
      const onReorder = vi.fn();
      render(
        <TopBar
          {...defaultProps}
          columns={[top, bottom, right]}
          onReorderColumnGroup={onReorder}
        />,
      );
      dragEnd("col-top", "col-right");
      expect(onReorder).toHaveBeenCalledWith(0, 1);
    });
  });

  describe("カラム種別アイコン（collapsed）", () => {
    it.each([
      "home",
      "notifications",
      "search",
      "list",
      "custom",
      "external",
      "compose",
    ] as const)(
      "pageType=%s のとき collapsed ボタン内に SVG アイコンが表示される",
      (pageType) => {
        const col: Column = { ...col1, pageType };
        const { container } = render(
          <TopBar {...defaultProps} columns={[col]} expanded={false} />,
        );
        expect(
          container.querySelector(`[data-testid="icon-${pageType}"]`),
        ).toBeInTheDocument();
      },
    );
  });

  describe("カラム種別アイコン（expanded）", () => {
    it.each([
      "home",
      "notifications",
      "search",
      "list",
      "custom",
      "external",
      "compose",
    ] as const)(
      "pageType=%s のとき expanded 行2内に SVG アイコンが表示される",
      (pageType) => {
        const col: Column = { ...col1, pageType };
        render(<TopBar {...defaultProps} columns={[col]} expanded={true} />);
        const row2 = screen.getByTestId("topbar-row2");
        expect(
          row2.querySelector(`[data-testid="icon-${pageType}"]`),
        ).toBeInTheDocument();
      },
    );
  });
});

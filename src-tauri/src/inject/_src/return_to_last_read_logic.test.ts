// return_to_last_read_logic.ts は副作用を持たない純粋関数群。
// DOM グルー（return_to_last_read.ts）は別ステップで実装するため、ここでは
// フェイク DOM（jsdom）とフェイク SearchDeps のみで検証する。
// jsdom はレイアウトを持たず getBoundingClientRect は既定で全て 0 を返すため、
// 並び順を検証するテストでは cell ごとに getBoundingClientRect をスタブする。
import { describe, it, expect } from "vitest";
import {
  ANCHOR_MAX,
  extractArticleStatusId,
  isAdArticle,
  isListTopRendered,
  readTimelineIds,
  selectAnchorIds,
  hasNewPostsAbove,
  scanReturnTarget,
  INITIAL_RETURN_STATE,
  reduceReturnState,
  searchReturnTarget,
  type ReturnState,
  type SearchDeps,
} from "./return_to_last_read_logic";

// --- DOM構築ヘルパー ---

/** timestamp リンク（time 子要素を持つ a）を備えた status ID 付き article を生成する。 */
function buildArticleWithStatusId(statusId: string): HTMLElement {
  const article = document.createElement("article");
  const link = document.createElement("a");
  link.setAttribute("href", `/username/status/${statusId}`);
  link.appendChild(document.createElement("time"));
  article.appendChild(link);
  return article;
}

/** [data-testid="placementTracking"] を持つ広告 article を生成する。 */
function buildAdArticleByTestId(): HTMLElement {
  const article = document.createElement("article");
  const marker = document.createElement("div");
  marker.dataset.testid = "placementTracking";
  article.appendChild(marker);
  return article;
}

/** 「広告」「Ad」「Promoted」等のテキストを持つ span を備えた article を生成する。 */
function buildAdArticleByText(text: string): HTMLElement {
  const article = document.createElement("article");
  const span = document.createElement("span");
  span.textContent = text;
  article.appendChild(span);
  return article;
}

function addSection(): HTMLElement {
  const section = document.createElement("section");
  section.setAttribute("aria-labelledby", "timeline");
  document.body.appendChild(section);
  return section;
}

/** section に cellInnerDiv でラップした article を追加し、getBoundingClientRect().top をスタブする。 */
function addCell(
  section: HTMLElement,
  article: HTMLElement,
  options: { top?: number; cellHidden?: boolean; articleHidden?: boolean } = {},
): HTMLElement {
  const cell = document.createElement("div");
  cell.dataset.testid = "cellInnerDiv";
  if (options.cellHidden) cell.style.display = "none";
  if (options.articleHidden) article.style.display = "none";
  cell.appendChild(article);
  section.appendChild(cell);
  cell.getBoundingClientRect = () => ({ top: options.top ?? 0 }) as DOMRect;
  return cell;
}

describe("inject/return_to_last_read_logic", () => {
  describe("extractArticleStatusId", () => {
    it("time子要素を持つstatusリンクからIDを抽出できる", () => {
      const article = buildArticleWithStatusId("123456789");

      expect(extractArticleStatusId(article)).toBe("123456789");
    });

    it("該当するリンクが無い場合はnullを返す", () => {
      const article = document.createElement("article");

      expect(extractArticleStatusId(article)).toBeNull();
    });

    it("time子要素を持たないstatusリンクは対象外となる", () => {
      const article = document.createElement("article");
      const likeLink = document.createElement("a");
      likeLink.setAttribute("href", "/username/status/123456789/likes");
      article.appendChild(likeLink);

      expect(extractArticleStatusId(article)).toBeNull();
    });
  });

  describe("isAdArticle", () => {
    it("placementTrackingを持つarticleは広告と判定する", () => {
      expect(isAdArticle(buildAdArticleByTestId())).toBe(true);
    });

    it.each(["広告", "Ad", "Promoted", "AD", "promoted"])(
      "spanのテキストが%sの場合は広告と判定する",
      (text) => {
        expect(isAdArticle(buildAdArticleByText(text))).toBe(true);
      },
    );

    it("広告マーカーが無い通常のarticleは広告と判定しない", () => {
      const article = buildArticleWithStatusId("1");

      expect(isAdArticle(article)).toBe(false);
    });

    it("無関係なテキストのspanは広告と判定しない", () => {
      const article = buildArticleWithStatusId("1");
      const span = document.createElement("span");
      span.textContent = "いいね";
      article.appendChild(span);

      expect(isAdArticle(article)).toBe(false);
    });
  });

  describe("readTimelineIds", () => {
    // extractArticleStatusId は status リンクの数値部分しか拾わないため、ここでは
    // 判別しやすいよう status ID にそのまま数値文字列を使う。
    it("広告・status ID無し・非表示のcell/articleを除いてcellのtop昇順に並べる", () => {
      const section = addSection();
      addCell(section, buildAdArticleByTestId(), { top: 0 });
      addCell(section, document.createElement("article"), { top: 1 });
      addCell(section, buildArticleWithStatusId("901"), {
        top: 2,
        cellHidden: true,
      });
      addCell(section, buildArticleWithStatusId("902"), {
        top: 3,
        articleHidden: true,
      });
      addCell(section, buildArticleWithStatusId("100"), { top: 10 });
      addCell(section, buildArticleWithStatusId("200"), { top: 5 });

      expect(readTimelineIds(section)).toEqual(["200", "100"]);
    });

    it("topが同値の場合はDOM順を保つ安定ソートになる", () => {
      const section = addSection();
      addCell(section, buildArticleWithStatusId("300"), { top: 5 });
      addCell(section, buildArticleWithStatusId("400"), { top: 5 });

      expect(readTimelineIds(section)).toEqual(["300", "400"]);
    });
  });

  describe("isListTopRendered", () => {
    // X の実DOMでは、仮想リストの先頭セルは必ず style.transform: translateY(0px) になる（実測）。
    // 手動更新 triggerReload(true) で scrollTop=0 にした直後は、まだ深い位置のセルしか
    // 描画されていないことがあり、そのタイミングで先頭スナップショットを取り込むと
    // 誤った基準になってしまうため、先頭セルの描画有無を判定する。
    it("先頭セル（translateY(0px)）が描画されていればtrueを返す", () => {
      const section = addSection();
      const cell1 = addCell(section, buildArticleWithStatusId("1"), { top: 0 });
      cell1.style.transform = "translateY(0px)";
      const cell2 = addCell(section, buildArticleWithStatusId("2"), { top: 1 });
      cell2.style.transform = "translateY(900px)";

      expect(isListTopRendered(section)).toBe(true);
    });

    it("深い位置のセルしか描画されていないときはfalseを返す", () => {
      const section = addSection();
      const cell1 = addCell(section, buildArticleWithStatusId("1"), { top: 0 });
      cell1.style.transform = "translateY(1200px)";
      const cell2 = addCell(section, buildArticleWithStatusId("2"), { top: 1 });
      cell2.style.transform = "translateY(1900px)";

      expect(isListTopRendered(section)).toBe(false);
    });

    it("transformを持つcellが1つも無い場合はtrueを返す（テスト用の素のDOM等）", () => {
      const section = addSection();
      addCell(section, buildArticleWithStatusId("1"), { top: 0 });
      addCell(section, buildArticleWithStatusId("2"), { top: 1 });

      expect(isListTopRendered(section)).toBe(true);
    });
  });

  describe("selectAnchorIds", () => {
    it("5件を超える場合は先頭5件を基準にする", () => {
      const ids = ["A", "B", "C", "D", "E", "F", "G"];

      expect(selectAnchorIds(ids)).toEqual(["A", "B", "C", "D", "E"]);
      expect(selectAnchorIds(ids).length).toBe(ANCHOR_MAX);
    });

    it("5件未満の場合は表示中の投稿だけを基準にする", () => {
      const ids = ["A", "B"];

      expect(selectAnchorIds(ids)).toEqual(["A", "B"]);
    });
  });

  describe("hasNewPostsAbove", () => {
    it("基準が空なら新着扱いしない", () => {
      expect(hasNewPostsAbove(["A"], [])).toBe(false);
    });

    it("表示中の投稿が空なら新着扱いしない", () => {
      expect(hasNewPostsAbove([], ["A", "B"])).toBe(false);
    });

    it("先頭が基準に無い場合は新着扱いする", () => {
      expect(hasNewPostsAbove(["N1"], ["A", "B"])).toBe(true);
    });

    it("基準が1件で先頭がそれと一致する場合は新着扱いしない", () => {
      expect(hasNewPostsAbove(["A", "N1"], ["A"])).toBe(false);
    });

    it("先頭が基準の投稿でも直下が基準内で先頭より後ろの要素でない場合は新着扱いする", () => {
      expect(hasNewPostsAbove(["A", "N1"], ["A", "B", "C"])).toBe(true);
    });

    it("先頭と直下が基準内で連続した順序のままなら新着扱いしない", () => {
      expect(hasNewPostsAbove(["A", "B"], ["A", "B", "C"])).toBe(false);
    });

    it("直下が基準内で先頭より前の要素の場合は新着扱いする", () => {
      expect(hasNewPostsAbove(["B", "A"], ["A", "B", "C"])).toBe(true);
    });

    it("表示中の投稿が1件のみで基準内に含まれる場合は新着扱いしない", () => {
      expect(hasNewPostsAbove(["A"], ["A", "B", "C"])).toBe(false);
    });
  });

  describe("scanReturnTarget", () => {
    it("基準内で連続する隣接ペアが見つかればrunを返す", () => {
      const result = scanReturnTarget(
        ["N1", "A", "B"],
        ["A", "B", "C", "D", "E"],
      );

      expect(result).toEqual({ kind: "run", id: "A" });
    });

    it("広告除外済みの列でも連続と判定できる", () => {
      const result = scanReturnTarget(
        ["N1", "N2", "A", "B", "C", "D", "E"],
        ["A", "B", "C", "D", "E"],
      );

      expect(result).toEqual({ kind: "run", id: "A" });
    });

    it("連続する箇所が無い場合は出現順のsinglesを返す", () => {
      const result = scanReturnTarget(
        ["N1", "B", "N2", "N3", "D", "N4"],
        ["A", "B", "C", "D", "E"],
      );

      expect(result).toEqual({ kind: "none", singles: ["B", "D"] });
    });

    it("基準内の順序が逆転している隣接は連続と判定しない", () => {
      const result = scanReturnTarget(["B", "A"], ["A", "B"]);

      expect(result).toEqual({ kind: "none", singles: ["B", "A"] });
    });

    it("基準の投稿が新着の中へ分散していても続けて並んでいる箇所を返す", () => {
      const result = scanReturnTarget(
        ["N1", "A", "N2", "N3", "D", "N4", "B", "C", "E"],
        ["A", "B", "C", "D", "E"],
      );

      expect(result).toEqual({ kind: "run", id: "B" });
    });
  });

  describe("reduceReturnState", () => {
    it("更新の直前に先頭から広告を除いた最大5件の投稿を基準として記録する", () => {
      const next = reduceReturnState(INITIAL_RETURN_STATE, {
        type: "reload",
        snapshot: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
      });

      expect(next).toEqual({
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: false,
      });
    });

    it("表示中の投稿が5件未満のときは表示中の投稿だけを基準にする", () => {
      const next = reduceReturnState(INITIAL_RETURN_STATE, {
        type: "reload",
        snapshot: ["A", "B"],
        tabName: "おすすめ",
      });

      expect(next.anchorIds).toEqual(["A", "B"]);
    });

    it("基準を消化していないうちに次の更新をしても基準は変わらない", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: false,
      };

      const next = reduceReturnState(withAnchor, {
        type: "reload",
        snapshot: ["N1", "N2", "A", "B", "C"],
        tabName: "おすすめ",
      });

      expect(next).toEqual(withAnchor);
    });

    it("戻るボタンで基準へ戻った後の更新では新しい基準を記録する", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: false,
      };
      const returned = reduceReturnState(withAnchor, {
        type: "returnFinished",
      });

      const next = reduceReturnState(returned, {
        type: "reload",
        snapshot: ["N1", "N2", "A", "B", "C"],
        tabName: "おすすめ",
      });

      expect(next.anchorIds).toEqual(["N1", "N2", "A", "B", "C"]);
      expect(next.consumed).toBe(false);
      expect(next.buttonVisible).toBe(false);
    });

    it("自分でスクロールして基準投稿を画面に表示した後の更新では新しい基準を記録する", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: true,
      };
      const seen = reduceReturnState(withAnchor, {
        type: "targetSeenByUser",
      });
      expect(seen.consumed).toBe(true);
      expect(seen.buttonVisible).toBe(false);

      const next = reduceReturnState(seen, {
        type: "reload",
        snapshot: ["N1", "N2", "A", "B", "C"],
        tabName: "おすすめ",
      });

      expect(next.anchorIds).toEqual(["N1", "N2", "A", "B", "C"]);
    });

    it("別のタブに切り替えると基準が破棄される", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: true,
      };

      const next = reduceReturnState(withAnchor, {
        type: "tabChanged",
        tabName: "フォロー中",
      });

      expect(next).toEqual(INITIAL_RETURN_STATE);
    });

    it("同じタブへのtabChangedでは基準を維持する", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: true,
      };

      const next = reduceReturnState(withAnchor, {
        type: "tabChanged",
        tabName: "おすすめ",
      });

      expect(next).toEqual(withAnchor);
    });

    it("基準が無い状態でのtabChangedは何もしない", () => {
      const next = reduceReturnState(INITIAL_RETURN_STATE, {
        type: "tabChanged",
        tabName: "フォロー中",
      });

      expect(next).toEqual(INITIAL_RETURN_STATE);
    });

    it("更新で基準より上に新しい投稿が入ったとき戻るボタンが表示される", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: false,
      };

      const next = reduceReturnState(withAnchor, {
        type: "topUpdated",
        topIds: ["N1", "N2", "A", "B"],
      });

      expect(next.buttonVisible).toBe(true);
    });

    it("更新後も先頭が基準の投稿でその直下に新しい投稿が入ったとき戻るボタンが表示される", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: false,
      };

      const next = reduceReturnState(withAnchor, {
        type: "topUpdated",
        topIds: ["A", "N1", "N2", "B", "C"],
      });

      expect(next.buttonVisible).toBe(true);
    });

    it("更新で新しい投稿が入らなかったときは戻るボタンが表示されない", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: false,
      };

      const next = reduceReturnState(withAnchor, {
        type: "topUpdated",
        topIds: ["A", "B", "C", "D", "E"],
      });

      expect(next.buttonVisible).toBe(false);
    });

    it("更新後の先頭で基準の投稿の間に広告が入っただけのときは戻るボタンが表示されない", () => {
      // 広告除外は readTimelineIds の責務。ここでは除外済みの列を渡す。
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: false,
      };

      const next = reduceReturnState(withAnchor, {
        type: "topUpdated",
        topIds: ["A", "B", "C", "D"],
      });

      expect(next.buttonVisible).toBe(false);
    });

    it("消化済みの基準はtopUpdatedを受けても表示状態を変えない", () => {
      const consumed: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: true,
        buttonVisible: false,
      };

      const next = reduceReturnState(consumed, {
        type: "topUpdated",
        topIds: ["N1", "N2"],
      });

      expect(next).toEqual(consumed);
    });

    it("自分でスクロールして基準投稿を画面に表示すると戻るボタンが消える", () => {
      const visible: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: true,
      };

      const next = reduceReturnState(visible, { type: "targetSeenByUser" });

      expect(next.consumed).toBe(true);
      expect(next.buttonVisible).toBe(false);
    });

    it("戻り探索が終わると見つかった/見つからないに関わらず消化済みにする", () => {
      const visible: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: true,
      };

      const next = reduceReturnState(visible, { type: "returnFinished" });

      expect(next.consumed).toBe(true);
      expect(next.buttonVisible).toBe(false);
    });

    it("disabledイベントで初期状態に戻る", () => {
      const withAnchor: ReturnState = {
        anchorIds: ["A", "B", "C", "D", "E"],
        tabName: "おすすめ",
        consumed: false,
        buttonVisible: true,
      };

      const next = reduceReturnState(withAnchor, { type: "disabled" });

      expect(next).toEqual(INITIAL_RETURN_STATE);
    });
  });

  describe("searchReturnTarget", () => {
    /**
     * scrollTop を viewportHeight 単位のページに区切ったフェイク仮想リスト。
     * setScrollTop は [0, (pages.length-1)*viewportHeight] にクランプする
     * （実仮想リストのスクロール終端の挙動を模す）。
     */
    function createFakeVirtualList(
      pages: string[][],
      options: { initialScrollTop?: number; viewportHeight?: number } = {},
    ): { deps: SearchDeps; setScrollIdToTopResult?: boolean } {
      const viewportHeight = options.viewportHeight ?? 800;
      const maxScrollTop = (pages.length - 1) * viewportHeight;
      let scrollTop = options.initialScrollTop ?? 0;

      function pageIndexFor(top: number): number {
        return Math.max(
          0,
          Math.min(pages.length - 1, Math.round(top / viewportHeight)),
        );
      }

      const deps: SearchDeps = {
        readIds: () => pages[pageIndexFor(scrollTop)] ?? [],
        getScrollTop: () => scrollTop,
        setScrollTop: (value: number) => {
          scrollTop = Math.max(0, Math.min(value, maxScrollTop));
        },
        getViewportHeight: () => viewportHeight,
        getScrollHeight: () => pages.length * viewportHeight,
        wait: () => Promise.resolve(),
        isInterrupted: () => false,
        scrollIdToTop: (id: string) =>
          pages[pageIndexFor(scrollTop)]?.includes(id) ?? false,
      };
      return { deps };
    }

    it("戻るボタンを押すと基準の先頭の投稿が画面上端に来るまでスクロールする", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      const { deps } = createFakeVirtualList([
        ["N1", "N2"],
        ["N3", "N4"],
        ["N5", "N6"],
        ["A", "B"],
      ]);

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "found", id: "A", fallback: false });
      expect(deps.getScrollTop()).toBe(2400);
    });

    it("基準の先頭の投稿が消えていたときは残っている中で最も上の基準投稿へ戻る", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      const { deps } = createFakeVirtualList([
        ["N1", "N2"],
        ["N3", "C", "D"],
      ]);

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "found", id: "C", fallback: false });
    });

    it("基準の投稿が続けて並んでいる箇所が無いときは最も下で見つかった基準の投稿へ戻る", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      const { deps } = createFakeVirtualList([
        ["N1", "B", "N2"],
        ["N3", "N4"],
        ["N5", "D", "N6"],
        ["N7"],
      ]);

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "found", id: "D", fallback: true });
    });

    it("anchorIdsが1件のときは単独一致で即foundになる", async () => {
      const anchorIds = ["A"];
      const { deps } = createFakeVirtualList([
        ["N1", "N2"],
        ["N3", "A", "N4"],
      ]);

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "found", id: "A", fallback: false });
    });

    it("基準の投稿がすべて見つからないときは元の位置に戻してnotFoundを返す", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      const { deps } = createFakeVirtualList([["N1"], ["N2"], ["N3"]], {
        initialScrollTop: 500,
      });

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "notFound" });
      expect(deps.getScrollTop()).toBe(500);
    });

    it("探している途中で自分でスクロールすると探索を中断しその位置のままにする", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      const { deps: baseDeps } = createFakeVirtualList(
        [["N1"], ["N2"], ["N3"], ["N4"]],
        { initialScrollTop: 999 },
      );
      let checks = 0;
      const deps: SearchDeps = {
        ...baseDeps,
        isInterrupted: () => {
          checks += 1;
          return checks > 2;
        },
      };

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "interrupted" });
      // 中断時点の位置のまま（探索開始前のscrollTop 999にも、先頭0にも戻さない）
      expect(deps.getScrollTop()).toBe(1600);
    });

    it("maxStepsに達したら無限ループせず打ち切ってnotFoundを返す", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      let readCalls = 0;
      let scrollTop = 0;
      const deps: SearchDeps = {
        readIds: () => {
          readCalls += 1;
          return ["N"]; // 基準に一致しない投稿だけが際限なく続く想定
        },
        getScrollTop: () => scrollTop,
        setScrollTop: (value: number) => {
          scrollTop = value; // クランプせず常に受理（末尾に到達しない状況を模す）
        },
        getViewportHeight: () => 800,
        getScrollHeight: () => 999999,
        wait: () => Promise.resolve(),
        isInterrupted: () => false,
        scrollIdToTop: () => false,
      };

      const result = await searchReturnTarget(anchorIds, deps, {
        maxSteps: 5,
      });

      expect(result).toEqual({ kind: "notFound" });
      expect(readCalls).toBe(5);
    });

    it("末尾でscrollHeightが増えたら打ち切らずに探索を継続する", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      let scrollTop = 0;
      let grown = false;
      let heightPollCount = 0;

      function currentPage(): string[] {
        return scrollTop === 0 ? ["N1"] : ["A", "B"];
      }

      const deps: SearchDeps = {
        readIds: () => currentPage(),
        getScrollTop: () => scrollTop,
        setScrollTop: (value: number) => {
          if (!grown && value > 0) {
            // 成長前は末尾でクランプされ進めない
            return;
          }
          scrollTop = value;
        },
        getViewportHeight: () => 800,
        getScrollHeight: () => {
          heightPollCount += 1;
          if (heightPollCount >= 2) grown = true;
          return grown ? 1600 : 800;
        },
        wait: () => Promise.resolve(),
        isInterrupted: () => false,
        scrollIdToTop: (id: string) => currentPage().includes(id),
      };

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "found", id: "A", fallback: false });
      expect(heightPollCount).toBeGreaterThanOrEqual(2);
    });

    it("同じ画面に単独の基準投稿が複数見えたときは画面内で最も下のものへ戻る", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      // 1画面（1ページ）内に B, D が同時に見える。A/C/E は無い。
      // scrollTop は同値になるため、画面内の並び位置（Dの方が下）で決着させる必要がある。
      const { deps } = createFakeVirtualList([["N1", "B", "N2", "D", "N3"]]);

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "found", id: "D", fallback: true });
    });

    it("末尾で追加読み込みを待っている間に自分でスクロールすると探索を中断する", async () => {
      const anchorIds = ["A", "B", "C", "D", "E"];
      let scrollTop = 0;
      let isInterruptedCalls = 0;
      let waitCalls = 0;
      let getScrollHeightCalls = 0;

      const deps: SearchDeps = {
        readIds: () => ["N1"], // 基準に一致する投稿は現れない
        getScrollTop: () => scrollTop,
        setScrollTop: (value: number) => {
          // 常に末尾でクランプされ進めない（＝毎回「末尾待ち」に入る）
          if (value <= 0) scrollTop = 0;
        },
        getViewportHeight: () => 800,
        getScrollHeight: () => {
          getScrollHeightCalls += 1;
          return 800; // 増加しない
        },
        wait: () => {
          waitCalls += 1;
          return Promise.resolve();
        },
        isInterrupted: () => {
          isInterruptedCalls += 1;
          // 1回目（メインループ先頭でのチェック）はfalse、
          // 2回目（末尾待ちポーリング中のチェック）でtrueにする
          return isInterruptedCalls > 1;
        },
        scrollIdToTop: () => false,
      };

      const result = await searchReturnTarget(anchorIds, deps);

      expect(result).toEqual({ kind: "interrupted" });
      // 末尾待ちのポーリング（wait(100)）を一度も実行せずに中断していること
      expect(waitCalls).toBe(2);
      expect(getScrollHeightCalls).toBe(1);
    });
  });
});

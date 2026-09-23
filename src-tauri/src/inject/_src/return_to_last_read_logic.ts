// src-tauri/src/inject/_src/return_to_last_read_logic.ts
//
// ホームタイムライン「前回の境目へ戻る」ボタンの純粋ロジック。
// 副作用（DOM 操作・IIFE 実行）は return_to_last_read.ts（DOM グルー）側に置き、
// このモジュールは import されるだけでは何も実行しない。
// 他の inject エントリ（auto_reload.ts 等）からは import しないこと。
// 複数エントリから import されるモジュールは Rollup が共有チャンク（import 文付き）を
// 出力してしまい、Rust 側の include_str! による単純連結が壊れるため。

// --- 定数（実測値。変更時は docs/development/inject-ipc-shortcuts-notes.md の計測を再実施） ---
export const ANCHOR_MAX = 5;
export const SEARCH_STEP_RATIO = 1.0; // 2.0 では境目を飛ばした
export const SEARCH_STEP_WAIT_MS = 80;
export const SEARCH_END_WAIT_MS = 3000; // 末尾で追加読み込みを待つ上限
export const SEARCH_MAX_STEPS = 150; // 70件取得時で約47ステップ
export const SEARCH_EXTRA_STEPS_AFTER_SINGLE = 30;
export const USER_INPUT_WINDOW_MS = 1000;

/**
 * article 内の timestamp リンク（time 子要素を持つ status リンク）の href から
 * status ID（数字文字列）を抽出する。
 * auto_reload.ts の同名関数と同じ規則だが、共有チャンク化を避けるためここに複製している
 * （auto_reload.ts は IIFE の副作用を持つため import できない）。
 * ビルド後は auto_reload.js と単純連結されるため、auto_reload.ts の extractStatusId と
 * 関数名を分けてトップレベル宣言の重複（後勝ち上書き）を避けている。
 */
export function extractArticleStatusId(article: Element): string | null {
  const links = article.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/status/"]',
  );
  for (const link of Array.from(links)) {
    if (!link.querySelector("time")) continue;
    const href = link.getAttribute("href");
    const match = href?.match(/\/status\/(\d+)/);
    if (match) return match[1];
  }
  return null;
}

const AD_DATA_TESTID_SELECTOR = '[data-testid="placementTracking"]';
const AD_TEXTS = ["Ad", "Promoted", "広告"];

/**
 * 広告判定。hide_ad.ts と同じ規則（[data-testid="placementTracking"] を持つ、
 * または span のテキストが Ad/Promoted/広告 のいずれかに一致する）。
 * hide_ad.ts の visibility 判定（span.offsetParent !== null）は、jsdom が
 * レイアウトを持たず常に null を返すため使わない。
 */
export function isAdArticle(article: Element): boolean {
  if (article.querySelector(AD_DATA_TESTID_SELECTOR)) return true;
  const spans = article.querySelectorAll("span");
  for (const span of Array.from(spans)) {
    const text = span.textContent?.trim() ?? "";
    if (!text) continue;
    if (AD_TEXTS.some((t) => t.toLowerCase() === text.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function isHiddenByDisplayNone(el: Element): boolean {
  return (el as HTMLElement).style?.display === "none";
}

/**
 * section 内の [data-testid="cellInnerDiv"] 配下の article を、画面上の上→下順
 * （cell の getBoundingClientRect().top 昇順、同値は DOM 順を保つ安定ソート）で並べ、
 * 広告・status ID 無し・非表示（cell/article の style.display === "none"）を除いた
 * status ID 列を返す。
 * jsdom はレイアウトを持たないため offsetParent は使わない（常に null になる）。
 */
export function readTimelineIds(section: Element): string[] {
  const cells = Array.from(
    section.querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]'),
  );

  const entries: { top: number; index: number; id: string }[] = [];
  cells.forEach((cell, index) => {
    if (isHiddenByDisplayNone(cell)) return;
    const article = cell.querySelector("article");
    if (!article) return;
    if (isHiddenByDisplayNone(article)) return;
    if (isAdArticle(article)) return;
    const id = extractArticleStatusId(article);
    if (id === null) return;
    entries.push({ top: cell.getBoundingClientRect().top, index, id });
  });

  entries.sort((a, b) => a.top - b.top || a.index - b.index);
  return entries.map((entry) => entry.id);
}

const LIST_TOP_TRANSFORM = "translateY(0px)";

/**
 * section 内の仮想リストの先頭セルが描画されているかを判定する。
 * X の実DOMでは、仮想リストの先頭セルの style.transform は必ず "translateY(0px)"（実測）。
 * 手動更新 triggerReload(true) で scrollTop を 0 にした直後は、まだ深い位置のセルしか
 * 描画されていないことがあるため、そのタイミングで先頭スナップショットを誤って
 * 取り込まないための判定に使う。
 * transform を持つセルが1つも無い場合（テスト用の素の DOM 等、判定材料が無い場合）は
 * 判定できないため true を返す（従来どおり許可する）。
 */
export function isListTopRendered(section: Element): boolean {
  const cells = Array.from(
    section.querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]'),
  );
  const withTransform = cells.filter((cell) => cell.style.transform !== "");
  if (withTransform.length === 0) return true;
  return withTransform.some(
    (cell) => cell.style.transform === LIST_TOP_TRANSFORM,
  );
}

/** 先頭から最大 max 件を基準として選ぶ。 */
export function selectAnchorIds(
  ids: string[],
  max: number = ANCHOR_MAX,
): string[] {
  return ids.slice(0, max);
}

/**
 * 基準より上（または基準の先頭の直下）に新しい投稿が入ったか。
 * - anchorIds / topIds が空 → false
 * - topIds[0] が基準に無い → true
 * - anchorIds が1件 → false（先頭が基準そのもの）
 * - topIds[1] が存在し、基準内で topIds[0] より後ろの要素でない → true
 * - それ以外 → false
 */
export function hasNewPostsAbove(
  topIds: string[],
  anchorIds: string[],
): boolean {
  if (anchorIds.length === 0 || topIds.length === 0) return false;

  const firstIndex = anchorIds.indexOf(topIds[0]);
  if (firstIndex === -1) return true;

  if (anchorIds.length === 1) return false;

  if (topIds.length >= 2) {
    const secondIndex = anchorIds.indexOf(topIds[1]);
    if (secondIndex === -1 || secondIndex <= firstIndex) return true;
    return false;
  }

  return false;
}

export type TargetScan =
  | { kind: "run"; id: string }
  | { kind: "none"; singles: string[] };

/**
 * 表示中の ID 列から戻り先を探す。
 * 隣接する2件 (ids[i], ids[i+1]) が両方基準に含まれ、基準内の順序が
 * ids[i] < ids[i+1] となる最初の i を「連続」とする。
 * 見つかれば { kind: "run", id: ids[i] }、無ければ
 * { kind: "none", singles: 基準に含まれる ID（出現順） }。
 */
export function scanReturnTarget(
  ids: string[],
  anchorIds: string[],
): TargetScan {
  const anchorIndex = new Map<string, number>();
  anchorIds.forEach((id, index) => anchorIndex.set(id, index));

  for (let i = 0; i < ids.length - 1; i++) {
    const currentIndex = anchorIndex.get(ids[i]);
    const nextIndex = anchorIndex.get(ids[i + 1]);
    if (
      currentIndex !== undefined &&
      nextIndex !== undefined &&
      currentIndex < nextIndex
    ) {
      return { kind: "run", id: ids[i] };
    }
  }

  const singles = ids.filter((id) => anchorIndex.has(id));
  return { kind: "none", singles };
}

// --- 状態（reducer） ---
export interface ReturnState {
  anchorIds: string[] | null;
  tabName: string | null;
  consumed: boolean;
  buttonVisible: boolean;
}

export const INITIAL_RETURN_STATE: ReturnState = {
  anchorIds: null,
  tabName: null,
  consumed: false,
  buttonVisible: false,
};

export type ReturnEvent =
  | { type: "reload"; snapshot: string[]; tabName: string | null }
  | { type: "topUpdated"; topIds: string[] }
  | { type: "tabChanged"; tabName: string | null }
  | { type: "targetSeenByUser" }
  | { type: "returnFinished" }
  | { type: "disabled" };

export function reduceReturnState(
  state: ReturnState,
  event: ReturnEvent,
): ReturnState {
  switch (event.type) {
    case "reload": {
      const shouldRecord = state.anchorIds === null || state.consumed;
      if (!shouldRecord || event.snapshot.length === 0) return state;
      return {
        anchorIds: event.snapshot,
        tabName: event.tabName,
        consumed: false,
        buttonVisible: false,
      };
    }

    case "topUpdated": {
      if (state.anchorIds === null || state.consumed) return state;
      const visible = hasNewPostsAbove(event.topIds, state.anchorIds);
      if (visible === state.buttonVisible) return state;
      return { ...state, buttonVisible: visible };
    }

    case "tabChanged": {
      if (state.anchorIds === null) return state;
      if (state.tabName !== event.tabName) return INITIAL_RETURN_STATE;
      return state;
    }

    case "targetSeenByUser": {
      if (state.anchorIds === null) return state;
      if (state.consumed && !state.buttonVisible) return state;
      return { ...state, consumed: true, buttonVisible: false };
    }

    case "returnFinished": {
      if (state.anchorIds === null) return state;
      if (state.consumed && !state.buttonVisible) return state;
      return { ...state, consumed: true, buttonVisible: false };
    }

    case "disabled":
      return INITIAL_RETURN_STATE;

    default:
      return state;
  }
}

// --- 探索 ---
export interface SearchDeps {
  /** 現在 DOM にある ID（上→下、広告等除外済み） */
  readIds(): string[];
  getScrollTop(): number;
  setScrollTop(value: number): void;
  getViewportHeight(): number;
  getScrollHeight(): number;
  wait(ms: number): Promise<void>;
  /** 探索開始後のユーザー入力があったか */
  isInterrupted(): boolean;
  /** DOM にあれば上端へ合わせて true */
  scrollIdToTop(id: string): boolean;
}

export interface SearchOptions {
  stepRatio: number;
  stepWaitMs: number;
  endWaitMs: number;
  maxSteps: number;
  extraStepsAfterSingle: number;
}

const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  stepRatio: SEARCH_STEP_RATIO,
  stepWaitMs: SEARCH_STEP_WAIT_MS,
  endWaitMs: SEARCH_END_WAIT_MS,
  maxSteps: SEARCH_MAX_STEPS,
  extraStepsAfterSingle: SEARCH_EXTRA_STEPS_AFTER_SINGLE,
};

const END_POLL_INTERVAL_MS = 100;

export type SearchResult =
  | { kind: "found"; id: string; fallback: boolean }
  | { kind: "notFound" }
  | { kind: "interrupted" };

/**
 * 基準（anchorIds）の戻り先を、先頭からスクロールしながら探す。
 * アルゴリズムは plan §4-1 のとおり（run 一致 → 単独基準の即時一致 →
 * singles を記録しつつ下へスクロール → 末尾/上限で打ち切り、最も下の single へ fallback）。
 */
export async function searchReturnTarget(
  anchorIds: string[],
  deps: SearchDeps,
  options?: Partial<SearchOptions>,
): Promise<SearchResult> {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };

  const start = deps.getScrollTop();
  deps.setScrollTop(0);
  await deps.wait(opts.stepWaitMs);

  // 単独一致した基準ごとに、見えたときの scrollTop と、そのとき読み取った
  // 列内での並び位置（画面内で上から何番目か）を覚えておく。
  // フォールバック選定は (scrollTop, position) の辞書順最大＝画面内で最も下のもの。
  // 同じ ID を後のステップで再び見た場合は新しい位置で上書きする。
  interface SingleSeen {
    scrollTop: number;
    position: number;
  }
  const singlesSeen = new Map<string, SingleSeen>();
  let firstSingleSeenStep: number | null = null;

  for (let step = 0; step < opts.maxSteps; step++) {
    if (deps.isInterrupted()) {
      return { kind: "interrupted" };
    }

    const scan = scanReturnTarget(deps.readIds(), anchorIds);

    if (scan.kind === "run") {
      deps.scrollIdToTop(scan.id);
      return { kind: "found", id: scan.id, fallback: false };
    }

    if (anchorIds.length === 1 && scan.singles.length > 0) {
      const id = scan.singles[0];
      deps.scrollIdToTop(id);
      return { kind: "found", id, fallback: false };
    }

    if (scan.singles.length > 0) {
      const currentScrollTop = deps.getScrollTop();
      scan.singles.forEach((id, position) => {
        singlesSeen.set(id, { scrollTop: currentScrollTop, position });
      });
      if (firstSingleSeenStep === null) {
        firstSingleSeenStep = step;
      }
    }

    if (
      firstSingleSeenStep !== null &&
      step - firstSingleSeenStep >= opts.extraStepsAfterSingle
    ) {
      break;
    }

    const prev = deps.getScrollTop();
    deps.setScrollTop(prev + deps.getViewportHeight() * opts.stepRatio);
    await deps.wait(opts.stepWaitMs);

    if (deps.getScrollTop() === prev) {
      const beforeHeight = deps.getScrollHeight();
      let grew = false;
      let waited = 0;
      while (waited < opts.endWaitMs) {
        if (deps.isInterrupted()) {
          return { kind: "interrupted" };
        }
        await deps.wait(END_POLL_INTERVAL_MS);
        waited += END_POLL_INTERVAL_MS;
        if (deps.getScrollHeight() > beforeHeight) {
          grew = true;
          break;
        }
      }
      if (!grew) break;
    }
  }

  if (singlesSeen.size > 0) {
    let bottomId: string | null = null;
    let bottom: SingleSeen | null = null;
    for (const [id, seen] of singlesSeen) {
      if (
        bottom === null ||
        seen.scrollTop > bottom.scrollTop ||
        (seen.scrollTop === bottom.scrollTop && seen.position > bottom.position)
      ) {
        bottom = seen;
        bottomId = id;
      }
    }
    if (bottomId !== null && bottom !== null) {
      deps.setScrollTop(bottom.scrollTop);
      await deps.wait(opts.stepWaitMs);
      deps.scrollIdToTop(bottomId);
      return { kind: "found", id: bottomId, fallback: true };
    }
  }

  deps.setScrollTop(start);
  return { kind: "notFound" };
}

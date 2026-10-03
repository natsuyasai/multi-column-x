// src-tauri/src/inject/_src/return_to_last_read.ts
//
// ホームタイムライン「前回の境目へ戻る」ボタンの DOM グルー（副作用 IIFE）。
// 純粋ロジックは return_to_last_read_logic.ts から import する（ロジックの再実装はしない）。
// 更新の検知は window.__multiColumnX.triggerReload をラップして行う。
// auto_reload.ts は変更しない（開放閉鎖）。ここでは auto_reload.ts を import しない
// （IIFE の二重実行を避けるため）。
import {
  INITIAL_RETURN_STATE,
  USER_INPUT_WINDOW_MS,
  extractArticleStatusId,
  isListTopRendered,
  readTimelineIds,
  reduceReturnState,
  scanReturnTarget,
  searchReturnTarget,
  selectAnchorIds,
  waitForTimelineReady,
  type ReturnEvent,
  type ReturnState,
  type SearchDeps,
} from "./return_to_last_read_logic";

(function () {
  const CONTAINER_ID = "mcx-return-to-last-read-container";
  const BUTTON_ID = "mcx-return-to-last-read";
  const CLOSE_BUTTON_ID = "mcx-return-to-last-read-close";
  const TOAST_ID = "mcx-return-to-last-read-toast";
  const TOAST_DURATION_MS = 3000;
  const NOT_FOUND_MESSAGE = "前回の位置が見つかりませんでした";
  const PHOTO_PATH_PATTERN = /^\/[^/]+\/status\/\d+\/photo\/\d+/;
  const SCROLL_KEYS = new Set([
    "PageDown",
    "PageUp",
    "ArrowDown",
    "ArrowUp",
    "Home",
    "End",
    " ",
    "j",
    "k",
  ]);

  let state: ReturnState = INITIAL_RETURN_STATE;
  let enabled = window.__multiColumnXConfig?.returnToLastReadEnabled ?? false;
  let topSnapshot: string[] = [];
  let searching = false;
  // 写真閲覧後の位置復元中（待機＋探索）。render() の可視判定には混ぜない
  // （「探しています…」ボタンを出さないため）。他機能との排他にだけ使う。
  let photoRestoring = false;
  // 写真リンクをクリックしたツイートの ID（SPA 遷移を跨いで保持するモジュール内変数）。
  let pendingPhotoReturnId: string | null = null;
  let lastUserInputAt = 0;
  let searchStartedAt = 0;
  let containerEl: HTMLElement | null = null;
  let buttonEl: HTMLButtonElement | null = null;
  let closeButtonEl: HTMLButtonElement | null = null;
  let toastEl: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function dispatch(event: ReturnEvent): void {
    state = reduceReturnState(state, event);
  }

  function isHomePath(): boolean {
    return location.pathname === "/home";
  }

  function isAnySearching(): boolean {
    return searching || photoRestoring;
  }

  function isPhotoPath(pathname: string): boolean {
    return PHOTO_PATH_PATTERN.test(pathname);
  }

  function currentTabName(): string | null {
    const tab = document.querySelector<HTMLElement>(
      'div[role="tablist"] div[role="tab"][aria-selected="true"]',
    );
    return tab ? (tab.textContent?.trim() ?? null) : null;
  }

  function timelineSection(): Element | null {
    return document.querySelector("section[aria-labelledby]");
  }

  function headerOffset(): number {
    const tablist = document.querySelector<HTMLElement>('div[role="tablist"]');
    if (!tablist) return 0;
    const bottom = tablist.getBoundingClientRect().bottom;
    return bottom < 0 ? 0 : bottom;
  }

  function findArticleById(section: Element, id: string): Element | null {
    const articles = section.querySelectorAll("article");
    for (const article of Array.from(articles)) {
      if (extractArticleStatusId(article) === id) return article;
    }
    return null;
  }

  function isInViewport(el: Element): boolean {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const offset = headerOffset();
    return rect.top >= offset && rect.top < window.innerHeight;
  }

  // --- ボタン / トースト ---

  function bottomOffset(): number {
    const navInset = window.__mobileBottomInset ?? 0;
    const swipeAreaOffset =
      window.__multiColumnXConfig?.mobileSwipeAreaOffset ?? 0;
    return 24 + navInset + swipeAreaOffset;
  }

  function containerStyle(): string {
    return `position:fixed; left:50%; transform:translateX(-50%); bottom: ${bottomOffset()}px; z-index:2147483000; display:flex; gap:8px; align-items:center;`;
  }

  function buttonStyle(): string {
    return `background:#1d9bf0; color:#fff; border:none; border-radius:9999px; padding:8px 16px; font:bold 14px/1.2 system-ui, sans-serif; box-shadow:0 2px 8px rgba(0,0,0,.3); cursor:pointer;`;
  }

  function closeButtonStyle(): string {
    return `width:32px; height:32px; border-radius:9999px; background:rgba(0,0,0,.6); color:#fff; border:none; font:bold 16px/1 system-ui, sans-serif; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; line-height:1;`;
  }

  function toastStyle(): string {
    return `position:fixed; left:50%; transform:translateX(-50%); bottom: ${bottomOffset()}px; z-index:2147483000; background:rgba(0,0,0,.8); color:#fff; border-radius:9999px; padding:8px 16px; font:bold 14px/1.2 system-ui, sans-serif;`;
  }

  function ensureContainer(): HTMLElement {
    if (containerEl) return containerEl;
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.cssText = containerStyle();
    document.body.appendChild(container);
    containerEl = container;
    return container;
  }

  function ensureButton(): HTMLButtonElement {
    if (buttonEl) return buttonEl;
    const container = ensureContainer();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = BUTTON_ID;
    btn.setAttribute("aria-label", "前回の続きへ戻る");
    btn.style.cssText = buttonStyle();
    btn.addEventListener("click", () => {
      handleClick().catch((e) => {
        console.error("[return_to_last_read]", e);
      });
    });
    container.appendChild(btn);
    buttonEl = btn;
    return btn;
  }

  function ensureCloseButton(): HTMLButtonElement {
    if (closeButtonEl) return closeButtonEl;
    const container = ensureContainer();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = CLOSE_BUTTON_ID;
    btn.setAttribute("aria-label", "前回の続きへ戻るボタンを閉じる");
    btn.textContent = "×";
    btn.style.cssText = closeButtonStyle();
    btn.addEventListener("click", () => {
      dispatch({ type: "dismissed" });
      render();
    });
    container.appendChild(btn);
    closeButtonEl = btn;
    return btn;
  }

  function showToast(message: string): void {
    if (!toastEl) {
      const el = document.createElement("div");
      el.id = TOAST_ID;
      el.setAttribute("role", "status");
      el.style.cssText = toastStyle();
      document.body.appendChild(el);
      toastEl = el;
    }
    // textContent への代入は値が同じでも DOM ミューテーション（子ノードの再構築）を
    // 起こす。共有 DOM 監視ハブ／フォールバック MutationObserver が document.body を
    // childList+subtree で監視しているため、無条件に代入すると
    // 「自分の描画がミューテーションを発生させ、それを観測して再描画する」という
    // 無限ループになる（探索中の描画で実際に発生し、テストがハングした）。
    // 値が変化したときだけ代入することでループを断ち切る。
    if (toastEl.textContent !== message) toastEl.textContent = message;
    if (toastEl.style.display !== "") toastEl.style.display = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastEl && toastEl.style.display !== "none") {
        toastEl.style.display = "none";
      }
    }, TOAST_DURATION_MS);
  }

  function render(): void {
    const visible =
      enabled && isHomePath() && (state.buttonVisible || searching);
    if (visible) {
      const container = ensureContainer();
      // showToast と同じ理由で、値が変化したときだけ代入する
      // （textContent の無条件代入は MutationObserver との無限ループを引き起こす）。
      if (container.style.display !== "flex") container.style.display = "flex";
      const btn = ensureButton();
      const text = searching ? "探しています…" : "↓ 前回の続きへ";
      if (btn.textContent !== text) btn.textContent = text;
      if (btn.disabled !== searching) btn.disabled = searching;
      const closeBtn = ensureCloseButton();
      if (closeBtn.disabled !== searching) closeBtn.disabled = searching;
    } else if (containerEl && containerEl.style.display !== "none") {
      containerEl.style.display = "none";
    }
  }

  // --- 更新検知・ユーザースクロール検知 ---

  // 先頭表示中（探索中でなく、スクロール位置が先頭付近で、仮想リストの先頭セルが
  // 描画済み）なら、基準候補（topSnapshot）を読み直して topUpdated を dispatch する。
  function refreshTopSnapshot(
    section: Element | null,
    scrollTop: number,
  ): void {
    if (
      !section ||
      isAnySearching() ||
      scrollTop > 1 ||
      !isListTopRendered(section)
    ) {
      return;
    }
    topSnapshot = selectAnchorIds(readTimelineIds(section));
    dispatch({ type: "topUpdated", topIds: topSnapshot });
  }

  // ユーザー操作によるスクロール（source === "scroll" かつ直近のユーザー入力から
  // USER_INPUT_WINDOW_MS 以内）で、戻り先（run 一致する基準）が画面内に入ったら
  // targetSeenByUser を dispatch する。
  function detectTargetSeenByUser(
    section: Element | null,
    source: "dom" | "scroll",
  ): void {
    if (
      !section ||
      source !== "scroll" ||
      isAnySearching() ||
      state.anchorIds === null ||
      Date.now() - lastUserInputAt >= USER_INPUT_WINDOW_MS
    ) {
      return;
    }
    const scan = scanReturnTarget(readTimelineIds(section), state.anchorIds);
    if (scan.kind !== "run") return;
    const article = findArticleById(section, scan.id);
    if (article && isInViewport(article)) {
      dispatch({ type: "targetSeenByUser" });
    }
  }

  function onDomOrScroll(source: "dom" | "scroll"): void {
    if (!enabled || !isHomePath()) {
      render();
      return;
    }

    // タブバーが再描画中などで一時的に見つからない（currentTabName() が null になる）
    // ときに tabChanged を dispatch すると、実際にはタブが変わっていないのに
    // 基準が破棄されてしまうため、null のときは dispatch しない。
    const tabName = currentTabName();
    if (tabName !== null) {
      dispatch({ type: "tabChanged", tabName });
    }

    const section = timelineSection();
    const scrollingElement = document.scrollingElement;
    const scrollTop = scrollingElement ? scrollingElement.scrollTop : 0;

    refreshTopSnapshot(section, scrollTop);
    detectTargetSeenByUser(section, source);

    render();
  }

  function isFromButton(target: EventTarget | null): boolean {
    return (
      !!containerEl && target instanceof Node && containerEl.contains(target)
    );
  }

  function handleUserInput(event: Event): void {
    if (isFromButton(event.target)) return;
    lastUserInputAt = Date.now();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!SCROLL_KEYS.has(event.key)) return;
    handleUserInput(event);
  }

  function subscribeDomChanges(
    callback: (mutations: MutationRecord[]) => void,
  ): () => void {
    if (window.__mcxDomObserver) {
      return window.__mcxDomObserver.subscribe(callback);
    }
    const observer = new MutationObserver(callback);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  // --- 探索 ---

  function buildSearchDeps(): SearchDeps {
    const getSection = (): Element | null => timelineSection();
    const getScroller = (): Element | null => document.scrollingElement;
    return {
      readIds: () => {
        const section = getSection();
        return section ? readTimelineIds(section) : [];
      },
      getScrollTop: () => getScroller()?.scrollTop ?? 0,
      setScrollTop: (value: number) => {
        const scroller = getScroller();
        if (scroller) scroller.scrollTop = value;
      },
      getViewportHeight: () => window.innerHeight,
      getScrollHeight: () => getScroller()?.scrollHeight ?? 0,
      wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
      isInterrupted: () => lastUserInputAt > searchStartedAt,
      scrollIdToTop: (id: string) => {
        const section = getSection();
        const scroller = getScroller();
        if (!section || !scroller) return false;
        const article = findArticleById(section, id);
        if (!article) return false;
        const rect = (article as HTMLElement).getBoundingClientRect();
        scroller.scrollTop += rect.top - headerOffset();
        return true;
      },
    };
  }

  async function handleClick(): Promise<void> {
    if (isAnySearching() || state.anchorIds === null) return;

    searching = true;
    searchStartedAt = Date.now();
    render();

    const anchorIds = state.anchorIds;
    const deps = buildSearchDeps();

    try {
      const result = await searchReturnTarget(anchorIds, deps);
      if (result.kind === "found") {
        dispatch({ type: "returnFinished" });
      } else if (result.kind === "notFound") {
        showToast(NOT_FOUND_MESSAGE);
        dispatch({ type: "returnFinished" });
      }
      // interrupted: 何もしない（ボタンは残す）
    } catch (e) {
      console.error("[return_to_last_read]", e);
    } finally {
      searching = false;
      render();
    }
  }

  // --- 写真閲覧後の位置復元 ---

  function isPhotoRestoreEnabled(): boolean {
    return window.__multiColumnXConfig?.scrollPosRestoreEnabled ?? false;
  }

  function isTimelineReady(): boolean {
    if (!isHomePath()) return false;
    const section = timelineSection();
    return (
      !!section &&
      readTimelineIds(section).length > 0 &&
      isListTopRendered(section)
    );
  }

  async function restoreAfterPhoto(): Promise<void> {
    const id = pendingPhotoReturnId;
    if (id === null || isAnySearching()) return;

    photoRestoring = true;
    searchStartedAt = Date.now();
    try {
      const ready = await waitForTimelineReady({
        isReady: isTimelineReady,
        shouldAbort: () => lastUserInputAt > searchStartedAt || !isHomePath(),
        wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
      if (ready !== "ready") return;
      const result = await searchReturnTarget([id], buildSearchDeps());
      if (result.kind === "notFound") {
        showToast(NOT_FOUND_MESSAGE);
      }
    } catch (e) {
      console.error("[return_to_last_read]", e);
    } finally {
      pendingPhotoReturnId = null;
      photoRestoring = false;
    }
  }

  function startPhotoRestore(): void {
    restoreAfterPhoto().catch((e) => {
      console.error("[return_to_last_read]", e);
    });
  }

  function handlePhotoLinkClick(event: MouseEvent): void {
    if (!isPhotoRestoreEnabled() || !isHomePath()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a");
    if (!link || link.origin !== location.origin) return;
    if (!isPhotoPath(link.pathname)) return;
    const article = link.closest("article");
    if (!article) return;
    const id = extractArticleStatusId(article);
    if (id !== null) pendingPhotoReturnId = id;
  }

  function observeNavigation(): void {
    let previousPath = location.pathname;

    const onNavigated = (): void => {
      const returnedFromPhoto = isPhotoPath(previousPath) && isHomePath();
      previousPath = location.pathname;
      if (returnedFromPhoto && isPhotoRestoreEnabled()) startPhotoRestore();
    };

    window.addEventListener("popstate", onNavigated);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      onNavigated();
    };
    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      previousPath = location.pathname;
    };
  }

  // --- 公開 API / triggerReload のラップ ---

  function recordReload(): void {
    if (!enabled || !isHomePath() || isAnySearching()) return;
    const tabName = currentTabName();
    // タブバーが一時的に見つからない（tabName === null）ときに tabChanged を
    // dispatch すると基準が誤って破棄されるため、null のときは dispatch しない。
    // reload イベントの tabName に null を渡すこと自体は問題ない。
    if (tabName !== null) {
      dispatch({ type: "tabChanged", tabName });
    }
    dispatch({ type: "reload", snapshot: topSnapshot, tabName });
    render();
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);

  window.__multiColumnX.setReturnToLastReadEnabled = (value: boolean): void => {
    enabled = value;
    if (!value) {
      dispatch({ type: "disabled" });
      render();
      return;
    }
    // 有効化した直後、DOM変化を待たずに先頭スナップショットを即時取得する。
    // これを呼ばないと、有効化後に一度もDOM変化/スクロールが起きないまま
    // 更新された場合に基準が記録されない（onDomOrScroll は render() も行う）。
    onDomOrScroll("dom");
  };

  const originalTriggerReload = window.__multiColumnX.triggerReload;
  if (originalTriggerReload) {
    window.__multiColumnX.triggerReload = function (
      scrollToTop?: boolean,
    ): void {
      recordReload();
      originalTriggerReload(scrollToTop);
    };
  }

  // --- セットアップ ---

  function setup(): void {
    subscribeDomChanges(() => onDomOrScroll("dom"));
    window.addEventListener("scroll", () => onDomOrScroll("scroll"), {
      capture: true,
      passive: true,
    });
    window.addEventListener("wheel", handleUserInput, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchstart", handleUserInput, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", handleUserInput, {
      capture: true,
      passive: true,
    });
    window.addEventListener("mousedown", handleUserInput, {
      capture: true,
      passive: true,
    });
    window.addEventListener(
      "keydown",
      handleKeydown as EventListenerOrEventListenerObject,
      { capture: true, passive: true },
    );
    window.addEventListener("click", handlePhotoLinkClick, { capture: true });
    observeNavigation();
    onDomOrScroll("dom");
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();

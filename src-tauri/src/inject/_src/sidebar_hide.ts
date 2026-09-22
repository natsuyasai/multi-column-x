/// <reference path="./types.d.ts" />
(function () {
  const SIDEBAR_SELECTOR = 'div[data-testid="sidebarColumn"]';
  const PRIMARY_SELECTOR = 'div[data-testid="primaryColumn"]';

  function expandChildren(
    root: HTMLElement,
    state: { stopped: boolean },
  ): void {
    if (state.stopped) return;
    for (const child of Array.from(root.children)) {
      if (state.stopped) return;
      if (child.tagName === "SECTION") {
        state.stopped = true;
        return;
      }
      const el = child as HTMLElement;
      if (
        el.tagName === "DIV" &&
        getComputedStyle(el).maxWidth.endsWith("px")
      ) {
        el.style.maxWidth = "100%";
      }
      expandChildren(el, state);
    }
  }

  function expandParents(primary: HTMLElement): void {
    let current: HTMLElement | null = primary.parentElement;
    while (current) {
      if (current.tagName === "MAIN") break;
      if (current.tagName === "DIV") {
        if (getComputedStyle(current).width.endsWith("px")) {
          current.style.width = "100%";
        }
      }
      current = current.parentElement;
    }
  }

  function apply(): void {
    const sidebar = document.body.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
    if (sidebar) {
      sidebar.style.setProperty("display", "none", "important");
    }

    const primary = document.body.querySelector<HTMLElement>(PRIMARY_SELECTOR);
    if (!primary) return;

    primary.style.maxWidth = "100%";
    expandChildren(primary, { stopped: false });

    expandParents(primary);
  }

  let applyTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleApply(): void {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 100);
  }

  function setup(): void {
    apply();
    // 共有DOM監視ハブ(dom_observer.ts)経由でDOM変化を検知する。ハブは
    // document.body を childList+subtree で監視し、MutationRecordの詳細に
    // 依存しないコールバック（毎回scheduleApply経由でapply()を再実行するだけ）
    // のため移行対象。詳細は tmp/plans/2026-09-22-inject-observer-consolidation/plan.md 参照。
    window.__mcxDomObserver?.subscribe(scheduleApply);
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();

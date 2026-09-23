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

  // 共有DOM監視ハブ(dom_observer.ts, window.__mcxDomObserver)経由でDOM変化を購読する。
  // ハブは document.body を childList+subtree で監視し、MutationRecordの詳細に依存
  // しないコールバック（毎回scheduleApply経由でapply()を再実行するだけ）を
  // requestAnimationFrameで1フレームにまとめて配る。ハブが無い環境（単体テストや、
  // 注入順序が変わった場合等）では、フォールバックとして従来と同じdocument.bodyの
  // childList+subtree監視をこのファイル単独で行う。
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

  function setup(): void {
    apply();
    subscribeDomChanges(scheduleApply);
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();

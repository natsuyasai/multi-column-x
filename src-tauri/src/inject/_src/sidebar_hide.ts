/// <reference path="./types.d.ts" />
(function () {
  const SIDEBAR_SELECTOR = 'div[data-testid="sidebarColumn"]';
  const PRIMARY_SELECTOR = 'div[data-testid="primaryColumn"]';

  function expandChildren(
    root: HTMLElement,
    targetMaxWidth: string,
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
      if (getComputedStyle(el).maxWidth === targetMaxWidth) {
        el.style.maxWidth = "100%";
      }
      expandChildren(el, targetMaxWidth, state);
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

    const originalMaxWidth = getComputedStyle(primary).maxWidth;
    primary.style.maxWidth = "100%";

    if (originalMaxWidth && originalMaxWidth !== "none") {
      expandChildren(primary, originalMaxWidth, { stopped: false });
    }

    expandParents(primary);
  }

  let applyTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleApply(): void {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(apply, 100);
  }

  function setup(): void {
    apply();
    new MutationObserver(scheduleApply).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();

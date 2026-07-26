(function () {
  // TopNavBar 配下で DashButton を含む div を非表示にする
  function applyTopNavHide(): void {
    const navBar = document.querySelector<HTMLElement>(
      "div[data-testid='TopNavBar']",
    );
    if (!navBar) return;

    const dashButton = navBar.querySelector<HTMLElement>(
      'button[data-testid="DashButton_ProfileIcon_Link"]',
    );
    if (!dashButton) return;

    // BFS で TopNavBar 直下から探索し、div が複数並ぶ最初の階層を見つける
    const queue: HTMLElement[] = [navBar];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const divChildren = Array.from(current.children).filter(
        (el) => el.tagName === "DIV",
      ) as HTMLElement[];

      if (divChildren.length >= 2) {
        // div が並んでいる階層が見つかった。dashButton を含む方を非表示にする
        const target = divChildren.find((div) => div.contains(dashButton));
        if (target && target.style.display !== "none") {
          target.style.setProperty("display", "none", "important");
        }
        return;
      }

      for (const child of divChildren) {
        queue.push(child);
      }
    }
  }

  const COMPOSE_LINK_SELECTOR = 'a[href="/compose/post"]';

  // #layers 配下の div のうち position:absolute の子要素を複数持つものを探し、
  // 子要素ごとに「投稿ボタン（a[href="/compose/post"]を含む）」か「ヘッダー要素（それ以外）」かを
  // 判定し、hideTweetInputEnabled / hideHeaderEnabled に応じて個別に非表示にする。
  function applyLayersHide(): void {
    const layers = document.getElementById("layers");
    if (!layers) return;

    const hideTweetInputEnabled =
      window.__multiColumnXConfig?.hideTweetInputEnabled ?? true;
    const hideHeaderEnabled =
      window.__multiColumnXConfig?.hideHeaderEnabled ?? true;

    for (const child of Array.from(layers.children)) {
      if (child.tagName !== "DIV") continue;
      const el = child as HTMLElement;
      const absoluteChildren = Array.from(el.children).filter(
        (c) => getComputedStyle(c as HTMLElement).position === "absolute",
      ) as HTMLElement[];
      if (absoluteChildren.length < 2) continue;

      for (const absChild of absoluteChildren) {
        const isComposeButton = !!absChild.querySelector(COMPOSE_LINK_SELECTOR);
        const shouldHide = isComposeButton
          ? hideTweetInputEnabled
          : hideHeaderEnabled;
        if (shouldHide && absChild.style.display !== "none") {
          absChild.style.setProperty("display", "none", "important");
        }
      }
      return;
    }
  }

  // header[role='banner'] の高さを div[role='tablist'] の高さに同期する
  function applyHeaderHeightSync(): void {
    const header = document.querySelector<HTMLElement>("header[role='banner']");
    if (!header) return;

    const tablist = document.querySelector<HTMLElement>("div[role='tablist']");
    if (!tablist) return;

    const tablistHeight = tablist.offsetHeight;
    if (tablistHeight <= 0) return;

    const heightPx = `${tablistHeight}px`;
    if (header.style.height !== heightPx) {
      header.style.setProperty("height", heightPx, "important");
    }
  }

  function apply(): void {
    applyTopNavHide();
    applyLayersHide();
    applyHeaderHeightSync();
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

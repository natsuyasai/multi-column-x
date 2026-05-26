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

    // ダッシュボタンから親を辿り、div 同士が兄弟になっている最初の階層を探す
    let current: HTMLElement | null = dashButton.parentElement;
    while (current && current !== navBar) {
      if (current.tagName === "DIV" && current.parentElement) {
        const siblingDivs = Array.from(current.parentElement.children).filter(
          (el) => el.tagName === "DIV",
        );
        if (siblingDivs.length >= 2) {
          if (current.style.display !== "none") {
            current.style.setProperty("display", "none", "important");
          }
          return;
        }
      }
      current = current.parentElement;
    }
  }

  // #layers 配下の div のうち position:absolute の子要素を複数持つものを非表示にする
  function applyLayersHide(): void {
    const layers = document.getElementById("layers");
    if (!layers) return;

    for (const child of Array.from(layers.children)) {
      if (child.tagName !== "DIV") continue;
      const el = child as HTMLElement;
      const absoluteChildren = Array.from(el.children).filter(
        (c) => getComputedStyle(c as HTMLElement).position === "absolute",
      );
      if (absoluteChildren.length >= 2 && el.style.display !== "none") {
        el.style.setProperty("display", "none", "important");
      }
    }
  }

  function apply(): void {
    applyTopNavHide();
    applyLayersHide();
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

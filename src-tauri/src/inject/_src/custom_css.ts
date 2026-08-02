// src-tauri/src/inject/_src/custom_css.ts
(function () {
  const CUSTOM_CSS_ID = "multi-column-x-custom-css";

  // 最後に適用が要求されたCSS。X.com側のSPA内DOM再構築でstyle要素が
  // 消えた際、MutationObserverによる自己修復（restoreIfMissing）で
  // 参照する状態として保持する。
  let lastAppliedCSS = "";

  function createStyleElement(css: string): void {
    const style = document.createElement("style");
    style.id = CUSTOM_CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function applyCustomCSS(css: string): void {
    lastAppliedCSS = css;
    const existing = document.getElementById(CUSTOM_CSS_ID);
    if (existing) existing.remove();
    if (!css || css.trim() === "") return;
    createStyleElement(css);
  }

  // headからstyle要素が消えている場合のみ、最後に適用されたCSSで再作成する。
  // 適用中のCSSが無ければ何もしない（余計な副作用を起こさない）。
  function restoreIfMissing(): void {
    if (!lastAppliedCSS || lastAppliedCSS.trim() === "") return;
    if (document.getElementById(CUSTOM_CSS_ID)) return;
    createStyleElement(lastAppliedCSS);
  }

  let restoreTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleRestore(): void {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreIfMissing, 100);
  }

  function setup(): void {
    new MutationObserver(scheduleRestore).observe(document.head, {
      childList: true,
    });
  }

  if (document.head) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.applyCustomCSS = applyCustomCSS;
})();

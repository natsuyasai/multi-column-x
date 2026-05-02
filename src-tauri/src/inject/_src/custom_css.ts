// src-tauri/src/inject/_src/custom_css.ts
(function () {
  const CUSTOM_CSS_ID = "twitter-viewer-custom-css";

  function applyCustomCSS(css: string): void {
    const existing = document.getElementById(CUSTOM_CSS_ID);
    if (existing) existing.remove();
    if (!css || css.trim() === "") return;
    const style = document.createElement("style");
    style.id = CUSTOM_CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.__twitterViewer = window.__twitterViewer || ({} as Window["__twitterViewer"]);
  window.__twitterViewer.applyCustomCSS = applyCustomCSS;
})();

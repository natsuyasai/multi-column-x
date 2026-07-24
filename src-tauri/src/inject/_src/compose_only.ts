// compose_only.ts
//
// 投稿カラム（page_type == "compose"）は /home を表示する。この inject は /home 上で
// 「インライン投稿フォーム」以外をスポットライトCSSで隠し、投稿専用の見た目にする。
// インライン投稿はページ遷移を起こさないため、URL遷移ロックや beforeunload の
// 確認ダイアログが発生しない。
//
// 投稿フォームの特定（locale 非依存）:
//   ホームタイムラインのコンテナ = 直接の子の一方が投稿フォーム（tweetTextarea_0 を含む）、
//   別の子がタイムライン（cellInnerDiv を含む）である要素。その投稿フォーム側の子を
//   "keep" ノードとする。
// スポットライト:
//   keep ノードから <body> までの各階層で、経路外の兄弟を非表示化する。
//   これによりサイドバー・ヘッダー・タイムライン・右カラム等が自然に隠れる。
// 例外（whitelist）:
//   投稿完了トースト [data-testid="toast"] を含む枝は隠さない（投稿成功フィードバックを残す）。
(function () {
  const HIDDEN_ATTR = "data-mcx-compose-hidden";
  const STYLE_ID = "mcx-compose-only";
  const TEXTAREA_SELECTOR = '[data-testid="tweetTextarea_0"]';
  const TIMELINE_CELL_SELECTOR = '[data-testid="cellInnerDiv"]';
  const TOAST_SELECTOR = '[data-testid="toast"]';

  window.__multiColumnX = window.__multiColumnX || ({} as MultiColumnXAPI);

  function ensureStyle(): void {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `[${HIDDEN_ATTR}]{display:none !important;}`;
  }

  // 投稿フォーム領域（keep ノード）を特定する。見つからなければ null。
  function findKeepNode(): Element | null {
    const textarea = document.querySelector(TEXTAREA_SELECTOR);
    if (!textarea) return null;
    let node: Element = textarea;
    while (node.parentElement && node !== document.body) {
      const parent = node.parentElement;
      const kids = Array.from(parent.children);
      const composerKid = kids.find((k) => k.contains(textarea));
      const timelineKid = kids.find((k) =>
        k.querySelector(TIMELINE_CELL_SELECTOR),
      );
      if (composerKid && timelineKid && composerKid !== timelineKid) {
        return composerKid;
      }
      node = parent;
    }
    return null;
  }

  // トースト（投稿完了通知）を含む枝は隠さない。
  function isProtected(el: Element): boolean {
    return el.matches(TOAST_SELECTOR) || !!el.querySelector(TOAST_SELECTOR);
  }

  function clearMarkers(): void {
    document
      .querySelectorAll(`[${HIDDEN_ATTR}]`)
      .forEach((e) => e.removeAttribute(HIDDEN_ATTR));
  }

  // スポットライトを（再）適用する。テストからも呼べるよう公開する。
  function applyComposeOnly(): void {
    const keep = findKeepNode();
    // 投稿フォーム領域を特定できないとき（タイムライン読込中で cellInnerDiv が
    // 一時的に無い等）は前回の適用状態を保持する。ここでクリアするとスポットライトが
    // 点滅するため、keep が取れたときだけクリア→再マークする。
    if (!keep) return;
    clearMarkers();
    ensureStyle();
    let node: Element = keep;
    while (node.parentElement && node !== document.body) {
      const parent = node.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node) continue;
        if (isProtected(sibling)) continue;
        sibling.setAttribute(HIDDEN_ATTR, "");
      }
      node = parent;
    }
  }

  window.__multiColumnX.applyComposeOnly = applyComposeOnly;

  // React 再描画・SPA 更新に追従して再適用する（rAF で 1 フレーム 1 回に間引く）。
  let scheduled = false;
  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyComposeOnly();
    });
  }

  const observer = new MutationObserver(schedule);

  function start(): void {
    applyComposeOnly();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();

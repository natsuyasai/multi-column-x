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
  // MutationObserver の再適用スロットル（X の連続DOM変異での過剰再適用を抑制）。
  const THROTTLE_MS = 250;
  // 非描画要素。X は <script> 等を高頻度で付け外しするため、これらを非表示対象に
  // 含めると差分が毎回発生して属性の付け外しが延々と繰り返される。描画もされないので
  // そもそも隠す必要がなく、対象から除外する。
  const NON_RENDERING_TAGS = new Set([
    "SCRIPT",
    "NOSCRIPT",
    "STYLE",
    "LINK",
    "META",
    "TEMPLATE",
    "HEAD",
    "TITLE",
    "BASE",
  ]);

  window.__multiColumnX = window.__multiColumnX || ({} as MultiColumnXAPI);

  // 非表示用スタイルは一度だけ生成する。
  // 重要: textContent を再代入すると <style> 配下の childList が変化し、
  // subtree を監視している MutationObserver を自己再発火させて無限ループになる。
  // そのため既に存在する場合は一切触らない。
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `[${HIDDEN_ATTR}]{display:none !important;}`;
    (document.head || document.documentElement).appendChild(style);
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

  // 非表示にすべき兄弟要素の集合を算出する（keep パス上の各階層の、経路外・
  // 非描画でない・非トースト兄弟）。
  function computeHiddenSet(keep: Element): Set<Element> {
    const shouldHide = new Set<Element>();
    let node: Element = keep;
    while (node.parentElement && node !== document.body) {
      const parent = node.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node) continue;
        if (NON_RENDERING_TAGS.has(sibling.tagName)) continue;
        if (isProtected(sibling)) continue;
        shouldHide.add(sibling);
      }
      node = parent;
    }
    return shouldHide;
  }

  const observer = new MutationObserver(() => schedule());

  function observeDom(): void {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // スポットライトを（再）適用する。テストからも呼べるよう公開する。
  function applyComposeOnly(): void {
    const keep = findKeepNode();
    // 投稿フォーム領域を特定できないとき（タイムライン読込中で cellInnerDiv が
    // 一時的に無い等）は前回の適用状態を保持する（ここでクリアすると点滅するため）。
    if (!keep) return;
    ensureStyle();
    const shouldHide = computeHiddenSet(keep);
    // 差分だけ反映する。既に正しい状態なら DOM を一切変更しない。これにより、
    // X が背面を再描画し続けても不要な属性の付け外し（churn）や再適用ループを防ぐ。
    // 属性変更で MutationObserver を再発火させないよう、変更中は監視を止める。
    observer.disconnect();
    try {
      document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
        if (!shouldHide.has(el)) el.removeAttribute(HIDDEN_ATTR);
      });
      shouldHide.forEach((el) => {
        if (!el.hasAttribute(HIDDEN_ATTR)) el.setAttribute(HIDDEN_ATTR, "");
      });
    } finally {
      observeDom();
    }
  }

  window.__multiColumnX.applyComposeOnly = applyComposeOnly;

  // React 再描画・SPA 更新に追従して再適用する。leading + trailing のスロットルで、
  // X の連続DOM変異でも最大 1 回 / THROTTLE_MS に抑える。
  let lastApply = 0;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  function schedule(): void {
    const elapsed = Date.now() - lastApply;
    if (elapsed >= THROTTLE_MS) {
      lastApply = Date.now();
      applyComposeOnly();
    } else if (trailingTimer === null) {
      trailingTimer = setTimeout(() => {
        trailingTimer = null;
        lastApply = Date.now();
        applyComposeOnly();
      }, THROTTLE_MS - elapsed);
    }
  }

  function start(): void {
    applyComposeOnly();
    observeDom();
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();

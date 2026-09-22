// src-tauri/src/inject/_src/dom_observer.ts
//
// カラム WebView に注入される多数の inject スクリプトが、それぞれ独自に
// document.body を { childList: true, subtree: true } で監視する MutationObserver を
// 持っており、X の DOM 変化のたびに全部が同期的に走っていた（詳細は
// tmp/plans/2026-09-22-inject-observer-consolidation/plan.md 参照）。
//
// このファイルは「document.body の childList+subtree 監視だけで済み、コールバックが
// MutationRecord の詳細に依存しない（毎回 DOM を再スキャンするだけ）」スクリプトのために、
// 単一の MutationObserver を共有するハブを提供する。受け取った MutationRecord は
// requestAnimationFrame で1フレーム1回にまとめて全購読者へ配る（rAF はペイント前に実行
// されるため、非表示処理等がちらつかない）。
//
// 移行しないスクリプト（attributes監視・document.body以外を監視・addedNodesを個別処理・
// 自身のobserverをdisconnect/reconnectする等）は、このハブを使わず従来どおり独自の
// MutationObserver を保持し続ける。分類の詳細は同plan.md / progress.md 参照。
(function () {
  // 多重注入に備えて冪等にする。既にハブが存在する場合は何もしない。
  if (window.__mcxDomObserver) return;

  const subscribers = new Set<(mutations: MutationRecord[]) => void>();
  let buffer: MutationRecord[] = [];
  let rafScheduled = false;
  let observer: MutationObserver | null = null;

  function flush(): void {
    rafScheduled = false;
    if (buffer.length === 0) return;
    const mutations = buffer;
    buffer = [];
    // 購読者の例外は個別に握りつぶし、他の購読者への通知を止めない。
    subscribers.forEach((callback) => {
      try {
        callback(mutations);
      } catch (e) {
        console.error("[dom_observer]", e);
      }
    });
  }

  function scheduleFlush(): void {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(flush);
  }

  function handleMutations(mutations: MutationRecord[]): void {
    buffer.push(...mutations);
    scheduleFlush();
  }

  function startObserving(): void {
    if (observer) return;
    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function subscribe(
    callback: (mutations: MutationRecord[]) => void,
  ): () => void {
    subscribers.add(callback);
    return function unsubscribe(): void {
      subscribers.delete(callback);
    };
  }

  window.__mcxDomObserver = { subscribe };

  if (document.body) {
    startObserving();
  } else {
    document.addEventListener("DOMContentLoaded", startObserving);
  }
})();

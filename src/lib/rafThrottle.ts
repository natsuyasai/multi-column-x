// src/lib/rafThrottle.ts
// requestAnimationFrame で関数呼び出しを 1 フレーム 1 回に集約するスロットル。
// 横スクロールのように高頻度で発火するイベントから、重い副作用（Linux の
// resize_column_webview による WebviewWindow 再配置）の連続発火を抑え、
// WebKitGTK WebProcess の負荷起因クラッシュを防ぐ目的で使う。

export interface RafThrottled<A extends unknown[]> {
  (...args: A): void;
  /** 保留中のフレームをキャンセルする（アンマウント時のクリーンアップ用）。 */
  cancel: () => void;
}

/**
 * `fn` を requestAnimationFrame で間引いて呼び出すスロットル版を返す。
 *
 * - 同一フレーム内に複数回呼ばれても、次フレームで一度だけ実行する。
 * - 実行時には最後に渡された引数を使う（最新の状態を反映するため）。
 */
export function rafThrottle<A extends unknown[]>(
  fn: (...args: A) => void,
): RafThrottled<A> {
  let rafId: number | null = null;
  let lastArgs: A | null = null;

  const throttled = (...args: A): void => {
    lastArgs = args;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const args = lastArgs;
      lastArgs = null;
      if (args) fn(...args);
    });
  };

  throttled.cancel = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

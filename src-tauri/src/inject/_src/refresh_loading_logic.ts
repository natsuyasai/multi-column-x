// src-tauri/src/inject/_src/refresh_loading_logic.ts
//
// 手動更新時のローディングバーの状態遷移（純粋ロジック）。
// DOM・タイマー・window には依存しない。副作用（XHR フック・バー DOM・setInterval）は
// auto_reload.ts 側に置き、このモジュールは import されるだけでは何も実行しない。
// auto_reload.ts からのみ import すること（他エントリから import すると共有チャンクが生じる）。

// --- 定数 ---
export const START_WAIT_MS = 1500; // 取得が始まらないとき消すまでの時間
export const MAX_DISPLAY_MS = 15000; // 全体の上限
export const MIN_DISPLAY_MS = 400; // 最低表示時間（一瞬で終わる取得でも見える）
export const POLL_INTERVAL_MS = 250;

export interface LoadingState {
  active: boolean;
  /** 最後の手動更新の時刻 */
  startedAt: number;
  /** 手動更新の後に始まり、未完了の取得ID */
  pending: ReadonlySet<number>;
  /** 手動更新の後に取得が1件以上始まったか */
  seen: boolean;
  /** 開始時の location.pathname */
  path: string;
}

export const INITIAL_LOADING_STATE: LoadingState = {
  active: false,
  startedAt: 0,
  pending: new Set<number>(),
  seen: false,
  path: "",
};

// GraphQL の「*Timeline」だけを対象にする。flow/timeline.json（約3秒ごとの定期ポーリング）や
// viewer_context.json・ViewerBadgeCounts は更新と無関係なので対象外。
const TIMELINE_REQUEST_PATTERN =
  /\/graphql\/[^/?#]+\/[A-Za-z]*Timeline(?:[?#]|$)/;

export function isTimelineRequestUrl(url: string): boolean {
  return TIMELINE_REQUEST_PATTERN.test(url);
}

/**
 * 手動更新の開始。すでに表示中の再更新では pending を引き継ぎ（バーは1本のまま）、
 * 未完了の取得が残っていなければ seen を数え直す。
 */
export function startLoading(
  state: LoadingState,
  now: number,
  path: string,
): LoadingState {
  if (!state.active) {
    return {
      active: true,
      startedAt: now,
      pending: new Set<number>(),
      seen: false,
      path,
    };
  }
  return {
    active: true,
    startedAt: now,
    pending: state.pending,
    seen: state.pending.size > 0 ? state.seen : false,
    path,
  };
}

/** 取得の開始。表示中のみ追跡する（手動更新の前から進行中だった取得は追跡しない）。 */
export function requestStarted(state: LoadingState, id: number): LoadingState {
  if (!state.active) return state;
  const pending = new Set(state.pending);
  pending.add(id);
  return { ...state, pending, seen: true };
}

/** 取得の完了（成功・失敗・中断を問わない）。未知の id は無視する。 */
export function requestFinished(state: LoadingState, id: number): LoadingState {
  if (!state.pending.has(id)) return state;
  const pending = new Set(state.pending);
  pending.delete(id);
  return { ...state, pending };
}

/** 消す条件に当たれば INITIAL_LOADING_STATE を、そうでなければ state をそのまま返す。 */
export function evaluate(
  state: LoadingState,
  now: number,
  path: string,
): LoadingState {
  if (!state.active) return state;
  const elapsed = now - state.startedAt;
  if (elapsed >= MAX_DISPLAY_MS) return INITIAL_LOADING_STATE;
  if (path !== state.path) return INITIAL_LOADING_STATE;
  if (state.pending.size > 0) return state;
  if (state.seen) {
    return elapsed >= MIN_DISPLAY_MS ? INITIAL_LOADING_STATE : state;
  }
  return elapsed >= START_WAIT_MS ? INITIAL_LOADING_STATE : state;
}

// src/constants/ipc.ts
//
// ネイティブ/WebView 間通信で使用する定数定義。
// Rust 側の対応定数は src-tauri/src/ipc_constants.rs を参照。

/** Tauri IPC コマンド名 */
export const IPC_COMMANDS = {
  // 設定
  LOAD_SETTINGS: "load_settings",
  SAVE_SETTINGS: "save_settings",

  // カラム WebView 管理
  CREATE_COLUMN_WEBVIEW: "create_column_webview",
  REMOVE_COLUMN_WEBVIEW: "remove_column_webview",
  RESIZE_COLUMN_WEBVIEW: "resize_column_webview",
  EVAL_IN_WEBVIEW: "eval_in_webview",

  // ポップアップ
  OPEN_POPUP_WINDOW: "open_popup_window",
  OPEN_LINK_POPUP_WINDOW: "open_link_popup_window",
  CLOSE_POPUP_WINDOW: "close_popup_window",
  SWITCH_POPUP_SESSION: "switch_popup_session",

  // コンポーズ
  OPEN_COMPOSE_WINDOW: "open_compose_window",

  // ブラウザ
  OPEN_IN_BROWSER: "open_in_browser",

  // アカウント管理
  OPEN_ADD_ACCOUNT_WINDOW: "open_add_account_window",
  NOTIFY_ACCOUNT_LOGGED_IN: "notify_account_logged_in",
  MARK_LOGIN_COMPLETE: "mark_login_complete",
  CHECK_LOGIN_COMPLETE: "check_login_complete",
  DELETE_ACCOUNT_DATA: "delete_account_data",
  CLOSE_WINDOW: "close_window",

  // モバイル
  REPORT_WEBVIEW_SCROLL: "report_webview_scroll",
  GET_MOBILE_INSETS: "get_mobile_insets",
  SET_COLUMN_COOKIES: "set_column_cookies",

  // 未読カウント
  REPORT_NEW_POSTS_COUNT: "report_new_posts_count",

  // キーボードショートカット
  REPORT_KEYBOARD_SHORTCUT: "report_keyboard_shortcut",
} as const;

/** Tauri イベント名 */
export const IPC_EVENTS = {
  /** アカウントログイン完了（デスクトップ: Rust emit → TS listen） */
  ACCOUNT_LOGIN_COMPLETE: "account-login-complete",
  /** WebView 横スクロール量（inject script → TS listen） */
  WEBVIEW_SCROLL: "webview-scroll",
  /** 最前面ポップアップを閉じる（Android JNI → TS listen） */
  CLOSE_TOPMOST_POPUP: "close-topmost-popup",
  /** カラムスワイプナビゲーション（Android JNI → TS listen）"left"|"right" */
  COLUMN_SWIPE_NAVIGATE: "column-swipe-navigate",
  /** カラムスワイプ進行中（Android JNI → TS listen）"left"|"right" */
  COLUMN_SWIPE_PROGRESS: "column-swipe-progress",
  /** カラムスワイプキャンセル（Android JNI → TS listen） */
  COLUMN_SWIPE_CANCEL: "column-swipe-cancel",
  /** アクティブカラムのダブルタップ（Android JNI → TS listen） */
  COLUMN_DOUBLE_TAP: "column-double-tap",
  /** 新着投稿カウント（inject script invoke → TS listen）{ label, count } */
  WEBVIEW_NEW_POSTS_COUNT: "webview-new-posts-count",
  /** キーボードショートカット（inject script invoke → TS listen）キー種別文字列 */
  WEBVIEW_KEYBOARD_SHORTCUT: "webview-keyboard-shortcut",
} as const;

/** WebView / ウィンドウラベルのプレフィックスと生成ヘルパー */
export const WEBVIEW_LABELS = {
  COLUMN_PREFIX: "column-",
  POPUP_PREFIX: "popup-",
  COMPOSE_PREFIX: "compose-",
  ADD_ACCOUNT_PREFIX: "add-account-",

  /** カラム WebView ラベルを生成する */
  column: (columnId: string) => `column-${columnId}`,
} as const;

/**
 * eval_in_webview コマンドに渡す window.__multiColumnX API 呼び出しスクリプト。
 * WebView 内に inject されたオブジェクトが存在しない場合は何もしない。
 */
export const WEBVIEW_SCRIPTS = {
  /** ページをリロードする */
  TRIGGER_RELOAD:
    "window.__multiColumnX && window.__multiColumnX.triggerReload();",

  /** スクロール位置を先頭に戻してからページをリロードする（ダブルタップ用） */
  SCROLL_TOP_AND_RELOAD:
    "window.__multiColumnX && window.__multiColumnX.triggerReload(true);",

  /** ヘッダーカスタマイズ（エリア除去）の有効/無効を切り替える */
  applyAreaRemove: (enabled: boolean) =>
    `window.__multiColumnX && window.__multiColumnX.applyAreaRemove(${enabled});`,

  /** カスタム CSS を適用する */
  applyCustomCSS: (css: string) => {
    const escaped = css.replace(/`/g, "\\`");
    return `(function(){var el=document.getElementById('__custom_css__');if(!el){el=document.createElement('style');el.id='__custom_css__';document.head.appendChild(el);}el.textContent=\`${escaped}\`;})();`;
  },

  /**
   * x.com の localforage (IndexedDB "localforage" / store "keyvaluepairs") の
   * "device:rweb.settings" エントリの local.scale を更新し、値が変化した場合のみリロードする。
   */
  applyColumnScale: (scale: string): string => {
    const s = JSON.stringify(scale);
    return `(function(){var s=${s};var r=indexedDB.open('localforage');r.onsuccess=function(e){var tx=e.target.result.transaction('keyvaluepairs','readwrite'),st=tx.objectStore('keyvaluepairs'),g=st.get('device:rweb.settings');g.onsuccess=function(e){var d=e.target.result;if(!d){d={local:{scale:s,_lastPersisted:Date.now()}};}else{if(!d.local)d.local={};if(d.local.scale===s)return;d.local.scale=s;d.local._lastPersisted=Date.now();}st.put(d,'device:rweb.settings').onsuccess=function(){location.reload();};};};})();`;
  },

  /** NGワードを動的に更新し、表示中のツイートにも即時適用する */
  applyNgWords: (ngWords: string[], globalNgWords: string[]) => {
    const ng = JSON.stringify(ngWords);
    const global = JSON.stringify(globalNgWords);
    return `if(window.__multiColumnXConfig){window.__multiColumnXConfig.ngWords=${ng};window.__multiColumnXConfig.globalNgWords=${global};}window.__multiColumnX&&window.__multiColumnX.recheckNgWords&&window.__multiColumnX.recheckNgWords();`;
  },
} as const;

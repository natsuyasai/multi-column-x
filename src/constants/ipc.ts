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
  GET_EXTERNAL_COLUMN_DATA_DIRECTORY: "get_external_column_data_directory",

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
  REAUTH_ACCOUNT_WINDOW: "reauth_account_window",
  DELETE_ACCOUNT_DATA: "delete_account_data",
  CLOSE_WINDOW: "close_window",

  // モバイル
  REPORT_WEBVIEW_SCROLL: "report_webview_scroll",
  GET_MOBILE_INSETS: "get_mobile_insets",
  SET_COLUMN_COOKIES: "set_column_cookies",
  IS_WEBVIEW_PROFILE_SUPPORTED: "is_webview_profile_supported",

  // 未読カウント
  REPORT_NEW_POSTS_COUNT: "report_new_posts_count",

  // APIレート制限
  REPORT_API_RATE_LIMIT: "report_api_rate_limit",

  // キーボードショートカット
  REPORT_KEYBOARD_SHORTCUT: "report_keyboard_shortcut",

  // 公式設定配布
  REPORT_OFFICIAL_SETTINGS: "report_official_settings",

  // 動画ダウンロード
  DOWNLOAD_VIDEO: "download_video",

  // モバイルスワイプバー（ネイティブオーバーレイ）
  UPDATE_MOBILE_SWIPE_BAR: "update_mobile_swipe_bar",
  FLASH_MOBILE_SWIPE_BAR: "flash_mobile_swipe_bar",
} as const;

/** Tauri イベント名 */
export const IPC_EVENTS = {
  /** アカウントログイン完了（デスクトップ: Rust emit → TS listen） */
  ACCOUNT_LOGIN_COMPLETE: "account-login-complete",
  /** WebView 横スクロール量（inject script → TS listen） */
  WEBVIEW_SCROLL: "webview-scroll",
  /** 最前面ポップアップを閉じる（Android JNI → TS listen） */
  CLOSE_TOPMOST_POPUP: "close-topmost-popup",
  /** 新着投稿カウント（inject script invoke → TS listen）{ label, count } */
  WEBVIEW_NEW_POSTS_COUNT: "webview-new-posts-count",
  /** キーボードショートカット（inject script invoke → TS listen）キー種別文字列 */
  WEBVIEW_KEYBOARD_SHORTCUT: "webview-keyboard-shortcut",
  /** カラム WebView の WebProcess クラッシュ通知（Linux: Rust emit → TS listen）payload=columnId */
  COLUMN_WEBVIEW_CRASHED: "column-webview-crashed",
  /** カラム WebView がOSフォーカスを得た通知（Windows: Rust emit → TS listen）payload=columnId */
  COLUMN_WEBVIEW_FOCUSED: "column-webview-focused",
  /** 再認証完了（desktop: Rust emit → TS listen）payload { accountId, xUserId }。account-login-complete とは別イベント。 */
  ACCOUNT_REAUTH_COMPLETE: "account-reauth-complete",
  /** 動画ダウンロード進捗（desktop: Rust emit_to → TS listen）payload { fileIndex, fileCount, current, total, phase } */
  VIDEO_DOWNLOAD_PROGRESS: "video-download-progress",
  /** APIレート制限残量通知（inject script invoke → TS listen）{ label, bucketKey, limit, remaining, reset } */
  WEBVIEW_API_RATE_LIMIT: "webview-api-rate-limit",
  /** モバイルスワイプバーの遷移確定通知（Android JNI → TS listen）payload は "left" | "right" */
  MOBILE_SWIPE_NAVIGATE: "mobile-swipe-navigate",
  /** モバイルスワイプバーのスワイプ中進捗通知（Android JNI → TS listen）payload は "left" | "right" | "" */
  MOBILE_SWIPE_PROGRESS: "mobile-swipe-progress",
  /** モバイルスワイプバーのダブルタップ確定通知（Android JNI → TS listen）payloadなし */
  MOBILE_SWIPE_DOUBLE_TAP: "mobile-swipe-double-tap",
  /** 公式設定ページのスナップショット取得通知（inject script invoke → TS listen）{ accountId, snapshot } */
  WEBVIEW_OFFICIAL_SETTINGS_CAPTURED: "webview-official-settings-captured",
  /** 公式設定ポップアップが実際に閉じられた通知（Rust emit → TS listen）。アカウント切替は含まない */
  OFFICIAL_SETTINGS_POPUP_CLOSED: "official-settings-popup-closed",
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

  /** ページ全体を再読み込みする（location.reload()） */
  RELOAD_PAGE: "location.reload();",

  /** スクロール位置を先頭に戻してからページをリロードする（ダブルタップ用） */
  SCROLL_TOP_AND_RELOAD:
    "window.__multiColumnX && window.__multiColumnX.triggerReload(true);",

  /** ヘッダー非表示・投稿欄非表示の有効/無効をそれぞれ切り替える（設定を__multiColumnXConfigにも反映し即時適用する） */
  applyAreaVisibility: (
    hideHeaderEnabled: boolean,
    hideTweetInputEnabled: boolean,
  ) =>
    `if(window.__multiColumnXConfig){window.__multiColumnXConfig.hideHeaderEnabled=${hideHeaderEnabled};window.__multiColumnXConfig.hideTweetInputEnabled=${hideTweetInputEnabled};}window.__multiColumnX&&window.__multiColumnX.applyAreaVisibility&&window.__multiColumnX.applyAreaVisibility(${hideHeaderEnabled}, ${hideTweetInputEnabled});window.__multiColumnX&&window.__multiColumnX.applyLayersHide&&window.__multiColumnX.applyLayersHide();`,

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

  /**
   * x.com の localforage (IndexedDB "localforage" / store "keyvaluepairs") の
   * "device:rweb.settings" エントリのうち、OFFICIAL_SETTINGS_WHITELIST_KEYS に含まれるフィールドのみを
   * 他アカウントから配布された値でマージし、加えて背景設定を管理する Cookie "night_mode" も反映して
   * リロードする。device:rweb.settings.local の scale 等ホワイトリスト外のフィールドは
   * 対象アカウント側の既存値を維持する。
   * snapshotJson は呼び出し元(useOfficialSettingsBroadcast、別タスクで実装予定)で組み立て済みの
   * `{ local: Record<string, unknown>, nightMode: string | null }` を JSON.stringify した文字列
   * （そのままJS式として埋め込む）。
   */
  applyOfficialSettingsSnapshot: (snapshotJson: string): string => {
    const keysJson = JSON.stringify(OFFICIAL_SETTINGS_WHITELIST_KEYS);
    return `(function(){var incoming=${snapshotJson};var keys=${keysJson};var nightMode=incoming&&Object.prototype.hasOwnProperty.call(incoming,'nightMode')?incoming.nightMode:undefined;if(nightMode===null){document.cookie='night_mode=; path=/; domain=.x.com; max-age=0';}else if(typeof nightMode==='string'){document.cookie='night_mode='+nightMode+'; path=/; domain=.x.com; max-age=34560000';}var incomingLocal=(incoming&&incoming.local)||{};var r=indexedDB.open('localforage');r.onsuccess=function(e){var tx=e.target.result.transaction('keyvaluepairs','readwrite'),st=tx.objectStore('keyvaluepairs'),g=st.get('device:rweb.settings');g.onsuccess=function(e){var existing=e.target.result||{};if(!existing.local)existing.local={};for(var i=0;i<keys.length;i++){var k=keys[i];if(Object.prototype.hasOwnProperty.call(incomingLocal,k)){existing.local[k]=incomingLocal[k];}}existing.local._lastPersisted=Date.now();existing._lastPersisted=Date.now();st.put(existing,'device:rweb.settings').onsuccess=function(){location.reload();};};};})();`;
  },

  /** night_mode Cookie を書き換え、値が変化した場合のみリロードする */
  applyNightModeCookie: (nightMode: string): string => {
    const n = JSON.stringify(nightMode);
    return `(function(){var n=${n};var m=document.cookie.match(/(?:^|; )night_mode=([^;]*)/);var current=m?m[1]:null;if(current===n)return;document.cookie='night_mode='+n+'; path=/; domain=.x.com; max-age=34560000';location.reload();})();`;
  },

  /** NGワードを動的に更新し、表示中のツイートにも即時適用する */
  applyNgWords: (ngWords: string[], globalNgWords: string[]) => {
    const ng = JSON.stringify(ngWords);
    const global = JSON.stringify(globalNgWords);
    return `if(window.__multiColumnXConfig){window.__multiColumnXConfig.ngWords=${ng};window.__multiColumnXConfig.globalNgWords=${global};}window.__multiColumnX&&window.__multiColumnX.recheckNgWords&&window.__multiColumnX.recheckNgWords();`;
  },

  /** ホワイトリストを動的に更新し、表示中のツイートにも即時適用する */
  applyWhitelist: (whitelistEnabled: boolean, whitelistWords: string[]) => {
    const words = JSON.stringify(whitelistWords);
    return `if(window.__multiColumnXConfig){window.__multiColumnXConfig.whitelistEnabled=${whitelistEnabled};window.__multiColumnXConfig.whitelistWords=${words};}window.__multiColumnX&&window.__multiColumnX.recheckNgWords&&window.__multiColumnX.recheckNgWords();`;
  },
} as const;

/** WebView を画面外へ退避させる座標 */
export const OFFSCREEN = {
  /** モバイル: 非アクティブカラムの退避位置 */
  MOBILE_X: -99999,
  /** デスクトップ: ダイアログ表示中の退避位置 */
  DESKTOP_X: -9999,
} as const;

/** localStorage キー */
export const STORAGE_KEYS = {
  /** モバイルのアクティブカラム ID（バックグラウンド復帰後の復元用） */
  ACTIVE_COLUMN_ID: "mcx_activeColumnId",
  /** 「後で」で見送った更新バージョン（再通知抑制用） */
  DISMISSED_UPDATE_VERSION: "mcx_dismissedUpdateVersion",
  /** 最後に What's New を表示した（=起動した）アプリバージョン */
  LAST_SEEN_VERSION: "mcx_lastSeenVersion",
} as const;

/**
 * device:rweb.settings.local のうち、アカウント間で配布して意味のある表示・アクセシビリティ設定のみのキー。
 * scale は既存の表示サイズ設定(columnScale)が管理するため対象外。
 * pushNotificationsPermission 等のブラウザ通知許可状態やタイムスタンプ系の内部トラッキング状態は
 * アカウント/デバイス固有のため対象外(2026-09-04 実データ確認: local には他に nextPushCheckin /
 * loginPromptLastShown / replyVotingSurveyClicked / undoPreview / isSideNavExpanded が存在する)。
 */
export const OFFICIAL_SETTINGS_WHITELIST_KEYS = [
  "themeColor",
  "highContrastEnabled",
  "reducedMotionEnabled",
  "shouldAutoPlayGif",
  "shouldAutoTagLocation",
  "showTweetMediaDetailDrawer",
  "autoPollNewTweets",
] as const;

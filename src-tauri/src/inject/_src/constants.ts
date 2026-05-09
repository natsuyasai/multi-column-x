// src-tauri/src/inject/_src/constants.ts
//
// inject スクリプト内で使用する Tauri IPC コマンド名の定義一覧。
// メインアプリ側の対応定数は src/constants/ipc.ts を参照。
//
// 注意: inject スクリプトは Vite で個別の単体 JS ファイルとしてビルドされ、
// Rust の include_str!() で埋め込まれるため、このファイルは import できない。
// 各スクリプトファイルの先頭でローカル定数として同じ値を定義すること。

/** inject スクリプトから呼び出す Tauri IPC コマンド名 */
export const INJECT_COMMANDS = {
  /** メディアリンククリック時にポップアップウィンドウを開く */
  OPEN_POPUP_WINDOW: "open_popup_window",
  /** コンテキストメニューからリンクポップアップウィンドウを開く */
  OPEN_LINK_POPUP_WINDOW: "open_link_popup_window",
  /** ポップアップウィンドウを閉じる */
  CLOSE_POPUP_WINDOW: "close_popup_window",
  /** ポップアップウィンドウのセッション（アカウント）を切り替える */
  SWITCH_POPUP_SESSION: "switch_popup_session",
  /** 横スクロール量をメインウィンドウに報告する */
  REPORT_WEBVIEW_SCROLL: "report_webview_scroll",
} as const;

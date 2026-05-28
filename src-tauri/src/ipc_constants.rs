// src-tauri/src/ipc_constants.rs
//
// ネイティブ/WebView 間通信で使用する定数定義。
// TypeScript 側の対応定数は src/constants/ipc.ts を参照。

/// Tauri emit/listen で使用するイベント名
#[allow(dead_code)]
pub mod events {
    /// アカウントログイン完了通知（デスクトップ: Rust emit → TS listen）
    pub const ACCOUNT_LOGIN_COMPLETE: &str = "account-login-complete";
    /// WebView 横スクロール量通知（inject script invoke → TS listen）
    pub const WEBVIEW_SCROLL: &str = "webview-scroll";
    /// 最前面ポップアップを閉じる（Android JNI → TS listen）
    pub const CLOSE_TOPMOST_POPUP: &str = "close-topmost-popup";
    /// カラムスワイプナビゲーション（Android JNI → TS listen）方向: "left"|"right"
    pub const COLUMN_SWIPE_NAVIGATE: &str = "column-swipe-navigate";
    /// カラムスワイプ進行中（Android JNI → TS listen）方向: "left"|"right"
    pub const COLUMN_SWIPE_PROGRESS: &str = "column-swipe-progress";
    /// カラムスワイプキャンセル（Android JNI → TS listen）
    pub const COLUMN_SWIPE_CANCEL: &str = "column-swipe-cancel";
    /// アクティブカラムのダブルタップ（Android JNI → TS listen）
    pub const COLUMN_DOUBLE_TAP: &str = "column-double-tap";
    /// 新着投稿カウント（inject script invoke → TS listen）{ label, count }
    pub const WEBVIEW_NEW_POSTS_COUNT: &str = "webview-new-posts-count";
    /// キーボードショートカット（inject script invoke → TS listen）キー種別文字列
    pub const WEBVIEW_KEYBOARD_SHORTCUT: &str = "webview-keyboard-shortcut";
}

/// WebView / ウィンドウラベルのプレフィックス
#[allow(dead_code)]
pub mod labels {
    /// カラム WebView ラベルプレフィックス（例: "column-<uuid>"）
    pub const COLUMN_PREFIX: &str = "column-";
    /// ポップアップウィンドウラベルプレフィックス（例: "popup-<uuid>"）
    pub const POPUP_PREFIX: &str = "popup-";
    /// コンポーズウィンドウラベルプレフィックス（例: "compose-<uuid>"）
    pub const COMPOSE_PREFIX: &str = "compose-";
    /// アカウント追加ウィンドウラベルプレフィックス（例: "add-account-<uuid8>"）
    pub const ADD_ACCOUNT_PREFIX: &str = "add-account-";
    /// アカウント追加ウィンドウラベル（モバイル固定値）
    pub const ADD_ACCOUNT_MOBILE: &str = "add-account";
}

/// inject スクリプトが参照する window グローバル変数名
#[allow(dead_code)]
pub mod globals {
    /// カラム WebView に注入される API オブジェクト
    pub const MULTI_COLUMN_X: &str = "__multiColumnX";
    /// カラム WebView に注入される設定オブジェクト
    pub const MULTI_COLUMN_X_CONFIG: &str = "__multiColumnXConfig";
    /// ポップアップ WebView に注入されるアカウント配列
    pub const TV_ACCOUNTS: &str = "__tvAccounts";
    /// ポップアップ WebView に注入される現在アカウント ID
    pub const TV_CURRENT_ACCOUNT_ID: &str = "__tvCurrentAccountId";
    /// ポップアップ WebView に注入されるターゲット href
    pub const TV_TARGET_HREF: &str = "__tvTargetHref";
    /// ポップアップ WebView に注入される Esc 閉じる設定
    pub const TV_ESC_CLOSE_ENABLED: &str = "__tvEscCloseEnabled";
}

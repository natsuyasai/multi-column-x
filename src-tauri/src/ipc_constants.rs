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
    /// メインウィンドウのラベル
    pub const MAIN: &str = "main";
    /// カラム WebView ラベルプレフィックス（例: "column-<uuid>"）
    pub const COLUMN_PREFIX: &str = "column-";
    /// ポップアップウィンドウラベルプレフィックス（例: "popup-<uuid>"）
    pub const POPUP_PREFIX: &str = "popup-";
    /// コンポーズウィンドウラベルプレフィックス（例: "compose-<uuid>"）
    pub const COMPOSE_PREFIX: &str = "compose-";
    /// アカウント追加ウィンドウラベルプレフィックス（例: "add-account-<uuid8>"）
    pub const ADD_ACCOUNT_PREFIX: &str = "add-account-";
}

/// inject スクリプトが参照する window グローバル変数名
#[allow(dead_code)]
pub mod globals {
    /// カラム WebView に注入される API オブジェクト
    pub const MULTI_COLUMN_X: &str = "__multiColumnX";
    /// カラム WebView に注入される設定オブジェクト
    pub const MULTI_COLUMN_X_CONFIG: &str = "__multiColumnXConfig";
    /// ポップアップ WebView に注入されるアカウント配列
    pub const MCX_ACCOUNTS: &str = "__mcxAccounts";
    /// ポップアップ WebView に注入される現在アカウント ID
    pub const MCX_CURRENT_ACCOUNT_ID: &str = "__mcxCurrentAccountId";
    /// ポップアップ WebView に注入されるターゲット href
    pub const MCX_TARGET_HREF: &str = "__mcxTargetHref";
    /// ポップアップ WebView に注入される Esc 閉じる設定
    pub const MCX_ESC_CLOSE_ENABLED: &str = "__mcxEscCloseEnabled";
}

/// TS 側（src/constants/ipc.contract.test.ts）と同じ fixture を参照する契約テスト。
/// 定数を変更したら contracts/ipc-constants.json も合わせて更新すること。
#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../contracts/ipc-constants.json")).unwrap()
    }

    #[test]
    fn events_match_contract_fixture() {
        let expected = &fixture()["events"];
        let actual = [
            ("ACCOUNT_LOGIN_COMPLETE", events::ACCOUNT_LOGIN_COMPLETE),
            ("WEBVIEW_SCROLL", events::WEBVIEW_SCROLL),
            ("CLOSE_TOPMOST_POPUP", events::CLOSE_TOPMOST_POPUP),
            ("COLUMN_SWIPE_NAVIGATE", events::COLUMN_SWIPE_NAVIGATE),
            ("COLUMN_SWIPE_PROGRESS", events::COLUMN_SWIPE_PROGRESS),
            ("COLUMN_SWIPE_CANCEL", events::COLUMN_SWIPE_CANCEL),
            ("COLUMN_DOUBLE_TAP", events::COLUMN_DOUBLE_TAP),
            ("WEBVIEW_NEW_POSTS_COUNT", events::WEBVIEW_NEW_POSTS_COUNT),
            (
                "WEBVIEW_KEYBOARD_SHORTCUT",
                events::WEBVIEW_KEYBOARD_SHORTCUT,
            ),
        ];
        assert_eq!(
            expected.as_object().unwrap().len(),
            actual.len(),
            "fixture のイベント数と Rust 側の定数数が一致しない"
        );
        for (key, value) in actual {
            assert_eq!(expected[key], value, "イベント {key} がドリフトしている");
        }
    }

    #[test]
    fn labels_match_contract_fixture() {
        let expected = &fixture()["labels"];
        let actual = [
            ("MAIN", labels::MAIN),
            ("COLUMN_PREFIX", labels::COLUMN_PREFIX),
            ("POPUP_PREFIX", labels::POPUP_PREFIX),
            ("COMPOSE_PREFIX", labels::COMPOSE_PREFIX),
            ("ADD_ACCOUNT_PREFIX", labels::ADD_ACCOUNT_PREFIX),
        ];
        assert_eq!(expected.as_object().unwrap().len(), actual.len());
        for (key, value) in actual {
            assert_eq!(expected[key], value, "ラベル {key} がドリフトしている");
        }
    }

    #[test]
    fn globals_match_contract_fixture() {
        let expected = &fixture()["globals"];
        let actual = [
            ("MULTI_COLUMN_X", globals::MULTI_COLUMN_X),
            ("MULTI_COLUMN_X_CONFIG", globals::MULTI_COLUMN_X_CONFIG),
            ("MCX_ACCOUNTS", globals::MCX_ACCOUNTS),
            ("MCX_CURRENT_ACCOUNT_ID", globals::MCX_CURRENT_ACCOUNT_ID),
            ("MCX_TARGET_HREF", globals::MCX_TARGET_HREF),
            ("MCX_ESC_CLOSE_ENABLED", globals::MCX_ESC_CLOSE_ENABLED),
        ];
        assert_eq!(expected.as_object().unwrap().len(), actual.len());
        for (key, value) in actual {
            assert_eq!(
                expected[key], value,
                "グローバル変数名 {key} がドリフトしている"
            );
        }
    }

    /// fixture の全コマンド名が lib.rs の generate_handler! に登録されていることを
    /// ソーステキストで検証する。コマンド関数の改名・削除を検出する。
    #[test]
    fn all_contract_commands_are_registered_in_lib_rs() {
        let lib_src = include_str!("lib.rs");
        let commands = fixture()["commands"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect::<Vec<_>>();
        for cmd in &commands {
            assert!(
                lib_src.contains(&format!("::{cmd},")) || lib_src.contains(&format!("::{cmd}\n")),
                "コマンド {cmd} が lib.rs の generate_handler! に見つからない"
            );
        }
    }
}

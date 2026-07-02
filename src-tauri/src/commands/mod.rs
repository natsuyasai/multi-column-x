pub mod account;
pub mod settings;
pub mod settings_store;
pub mod update;
pub mod webview;

use crate::ipc_constants::labels;

/// ラベルが main ウィンドウのものかどうかを判定する（純粋関数）。
fn is_main_label(label: &str) -> bool {
    label == labels::MAIN
}

/// 破壊的コマンドの呼び出し元が main ウィンドウであることを要求する。
/// カラム / ポップアップ等のリモートコンテンツから呼ばれた場合はエラーを返す。
pub(crate) fn require_main_caller(webview: &tauri::Webview) -> Result<(), String> {
    if is_main_label(webview.label()) {
        Ok(())
    } else {
        Err("forbidden: caller must be the main window".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mainラベルのみ許可する() {
        assert!(is_main_label("main"));
    }

    #[test]
    fn columnプレフィックスのラベルは拒否する() {
        assert!(!is_main_label("column-abc123"));
    }

    #[test]
    fn popupプレフィックスのラベルは拒否する() {
        assert!(!is_main_label("popup-abc123"));
    }
}

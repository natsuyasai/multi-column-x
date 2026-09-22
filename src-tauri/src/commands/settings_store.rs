//! settings.json（tauri-plugin-store）からの読み出しヘルパー。
//! スキーマは TypeScript 側 src/types/index.ts と settings.rs の構造体定義に従う。
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub(crate) fn load_global_settings(app: &AppHandle) -> serde_json::Value {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("globalSettings").cloned())
        .unwrap_or(serde_json::Value::Null)
}

/// `settings` オブジェクトから `key` の bool 値を取り出す。
/// キーが存在しない・値が bool 以外の場合は `default` を返す。
fn bool_flag(settings: &serde_json::Value, key: &str, default: bool) -> bool {
    settings
        .get(key)
        .and_then(|v| v.as_bool())
        .unwrap_or(default)
}

/// `settings` オブジェクトから `key` の文字列配列を取り出す。
/// キーが存在しない・配列でない場合は空配列を返し、配列内の文字列以外の要素は除外する。
fn string_list(settings: &serde_json::Value, key: &str) -> Vec<String> {
    settings
        .get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// アカウント配列 JSON を、必須フィールド（id/label/color/dataDirectory）が
/// 揃った要素だけを抽出した JSON 文字列へ変換する。配列でない場合は `"[]"` を返す。
fn accounts_to_json(accounts: &serde_json::Value) -> String {
    accounts
        .as_array()
        .and_then(|arr| {
            let infos: Vec<serde_json::Value> = arr
                .iter()
                .filter_map(|a| {
                    Some(serde_json::json!({
                        "id": a.get("id")?.as_str()?,
                        "label": a.get("label")?.as_str()?,
                        "color": a.get("color")?.as_str()?,
                        "dataDirectory": a.get("dataDirectory")?.as_str()?,
                    }))
                })
                .collect();
            serde_json::to_string(&infos).ok()
        })
        .unwrap_or_else(|| "[]".to_string())
}

pub(crate) fn load_popup_esc_close_enabled(app: &AppHandle) -> bool {
    bool_flag(&load_global_settings(app), "popupEscCloseEnabled", true)
}

/// カラム起動スクリプト構築に必要な全体設定値をまとめた構造体。
/// `build_column_init_script` が `load_global_settings` を1回だけ呼び出し、
/// ここから全フラグを取り出すために使う。
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ColumnScriptSettings {
    pub(crate) video_auto_play_stop_enabled: bool,
    pub(crate) hide_ad_enabled: bool,
    pub(crate) api_rate_limit_monitor_enabled: bool,
    pub(crate) image_popup_enabled: bool,
    pub(crate) video_popup_enabled: bool,
    pub(crate) global_ng_words: Vec<String>,
    pub(crate) global_repost_hidden_user_ids: Vec<String>,
}

/// 読み込み済みの `globalSettings` JSON からカラム起動スクリプト用の値をまとめて取り出す。
/// 既定値（キー欠落時の値）は各値ごとの従来の挙動と同じにする。
pub(crate) fn column_script_settings_from(global: &serde_json::Value) -> ColumnScriptSettings {
    ColumnScriptSettings {
        video_auto_play_stop_enabled: bool_flag(global, "videoAutoPlayStopEnabled", false),
        hide_ad_enabled: bool_flag(global, "hideAdEnabled", false),
        api_rate_limit_monitor_enabled: bool_flag(global, "apiRateLimitMonitorEnabled", true),
        image_popup_enabled: bool_flag(global, "imagePopupEnabled", true),
        video_popup_enabled: bool_flag(global, "videoPopupEnabled", true),
        global_ng_words: string_list(global, "ngWords"),
        global_repost_hidden_user_ids: string_list(global, "repostHiddenUserIds"),
    }
}

#[cfg(target_os = "android")]
pub(crate) fn load_use_x_app_for_compose(app: &AppHandle) -> bool {
    bool_flag(&load_global_settings(app), "useXAppForCompose", false)
}

pub(crate) fn load_accounts_json(app: &AppHandle) -> String {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("accounts").cloned())
        .map(|accounts| accounts_to_json(&accounts))
        .unwrap_or_else(|| "[]".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn キーが存在しない場合はデフォルト値を返す() {
        let settings = serde_json::json!({});
        assert!(bool_flag(&settings, "videoAutoPlayStopEnabled", true));
        assert!(!bool_flag(&settings, "hideAdEnabled", false));
    }

    #[test]
    fn bool以外の型はデフォルト値を返す() {
        let settings = serde_json::json!({ "hideAdEnabled": "true" });
        assert!(!bool_flag(&settings, "hideAdEnabled", false));

        let settings = serde_json::json!({ "imagePopupEnabled": 1 });
        assert!(bool_flag(&settings, "imagePopupEnabled", true));
    }

    #[test]
    fn ngwordsは文字列要素のみ抽出する() {
        let settings = serde_json::json!({
            "ngWords": ["spam", 123, "ad", null, "sale"]
        });
        assert_eq!(
            string_list(&settings, "ngWords"),
            vec!["spam".to_string(), "ad".to_string(), "sale".to_string()]
        );
    }

    #[test]
    fn ngwordsキーが存在しない場合は空配列を返す() {
        let settings = serde_json::json!({});
        assert!(string_list(&settings, "ngWords").is_empty());
    }

    #[test]
    fn リポスト元ユーザーidは文字列要素のみ抽出する() {
        let settings = serde_json::json!({
            "repostHiddenUserIds": ["alice", 1, "Bob_1", null]
        });
        assert_eq!(
            string_list(&settings, "repostHiddenUserIds"),
            vec!["alice".to_string(), "Bob_1".to_string()]
        );
    }

    #[test]
    fn 旧バージョンの保存設定はリポスト元ユーザーidが空として読み込まれる() {
        let settings = serde_json::json!({ "ngWords": ["spam"] });
        assert!(string_list(&settings, "repostHiddenUserIds").is_empty());
    }

    #[test]
    fn 全体設定から各フラグを一度に取り出す() {
        let settings = serde_json::json!({
            "videoAutoPlayStopEnabled": true,
            "hideAdEnabled": true,
            "apiRateLimitMonitorEnabled": false,
            "imagePopupEnabled": false,
            "videoPopupEnabled": false,
            "ngWords": ["spam"],
            "repostHiddenUserIds": ["alice"],
        });
        assert_eq!(
            column_script_settings_from(&settings),
            ColumnScriptSettings {
                video_auto_play_stop_enabled: true,
                hide_ad_enabled: true,
                api_rate_limit_monitor_enabled: false,
                image_popup_enabled: false,
                video_popup_enabled: false,
                global_ng_words: vec!["spam".to_string()],
                global_repost_hidden_user_ids: vec!["alice".to_string()],
            }
        );
    }

    #[test]
    fn キーが無いときは従来と同じ既定値になる() {
        let settings = serde_json::json!({});
        assert_eq!(
            column_script_settings_from(&settings),
            ColumnScriptSettings {
                video_auto_play_stop_enabled: false,
                hide_ad_enabled: false,
                api_rate_limit_monitor_enabled: true,
                image_popup_enabled: true,
                video_popup_enabled: true,
                global_ng_words: vec![],
                global_repost_hidden_user_ids: vec![],
            }
        );
    }

    #[test]
    fn アカウントは必須フィールドが揃ったものだけjson化する() {
        let accounts = serde_json::json!([
            {
                "id": "1",
                "label": "acc1",
                "color": "#fff",
                "dataDirectory": "/data/1",
                "createdAt": "2026-01-01"
            },
            {
                "id": "2",
                "label": "acc2",
                // color 欠落 → 除外される
                "dataDirectory": "/data/2"
            }
        ]);
        let json = accounts_to_json(&accounts);
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            parsed,
            serde_json::json!([
                {
                    "id": "1",
                    "label": "acc1",
                    "color": "#fff",
                    "dataDirectory": "/data/1"
                }
            ])
        );
    }

    #[test]
    fn アカウントが配列でない場合は空配列jsonを返す() {
        assert_eq!(accounts_to_json(&serde_json::Value::Null), "[]");
    }
}

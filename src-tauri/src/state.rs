// src-tauri/src/state.rs
use std::collections::HashMap;
use std::sync::Mutex;

pub struct WebviewRegistry {
    pub entries: HashMap<String, WebviewEntry>,
}

pub struct WebviewEntry {
    #[allow(dead_code)]
    pub column_id: String,
    #[allow(dead_code)]
    pub account_id: String,
    pub data_directory: String,
}

/// 常駐コンポーズ WebView の状態（デスクトップ / Android 共通）。
pub struct ComposeSession {
    pub label: String,
    pub account_id: String,
}

/// open_compose_window が取るべきアクション。
#[derive(Debug, PartialEq)]
pub enum ComposeAction {
    /// 既存の常駐を再表示して /compose/post へ遷移する
    Reuse { label: String },
    /// アカウントが変わったため旧常駐を破棄して作り直す
    Replace { old_label: String },
    /// 常駐が無いので新規作成する
    CreateNew,
}

/// 現在の常駐コンポーズ状態と要求されたアカウントIDから、取るべきアクションを判定する。
pub fn decide_compose_action(
    current: Option<&ComposeSession>,
    requested_account_id: &str,
) -> ComposeAction {
    match current {
        None => ComposeAction::CreateNew,
        Some(session) if session.account_id == requested_account_id => ComposeAction::Reuse {
            label: session.label.clone(),
        },
        Some(session) => ComposeAction::Replace {
            old_label: session.label.clone(),
        },
    }
}

/// 指定した label が現在常駐しているコンポーズ WebView のものかどうかを判定する。
/// close_popup_window の Esc 経路で「破棄せず非表示にする」対象かどうかの判定に使う。
pub fn is_persistent_compose_label(compose: Option<&ComposeSession>, label: &str) -> bool {
    compose.is_some_and(|session| session.label == label)
}

pub struct AppState {
    pub registry: Mutex<WebviewRegistry>,
    pub compose: Mutex<Option<ComposeSession>>,
    /// 現在追跡中の公式設定ポップアップのラベル（アカウント切替時は新ラベルへ付け替える。
    /// 実際に破棄された時点でこのラベルと一致すれば OFFICIAL_SETTINGS_POPUP_CLOSED を emit する）。
    pub official_settings_popup_label: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            registry: Mutex::new(WebviewRegistry {
                entries: HashMap::new(),
            }),
            compose: Mutex::new(None),
            official_settings_popup_label: Mutex::new(None),
        }
    }
}

impl WebviewRegistry {
    pub fn register(
        &mut self,
        label: String,
        column_id: String,
        account_id: String,
        data_directory: String,
    ) {
        self.entries.insert(
            label,
            WebviewEntry {
                column_id,
                account_id,
                data_directory,
            },
        );
    }

    pub fn unregister(&mut self, label: &str) {
        self.entries.remove(label);
    }

    pub fn get_account_id(&self, label: &str) -> Option<&str> {
        self.entries.get(label).map(|e| e.account_id.as_str())
    }

    pub fn get_data_directory(&self, label: &str) -> Option<&str> {
        self.entries.get(label).map(|e| e.data_directory.as_str())
    }

    /// 稼働中プロファイル（data_directory）ごとの代表 label。
    /// 空の data_directory は除外し、同一 data_directory では辞書順最小の label を代表にする。
    /// 結果は data_directory 順（決定的）。
    // 拡張機能の同期（後続ステップ）で使用するまで未使用。
    #[allow(dead_code)]
    pub fn distinct_data_directories(&self) -> Vec<(String, String)> {
        let mut representatives: HashMap<&str, &str> = HashMap::new();
        for (label, entry) in &self.entries {
            if entry.data_directory.is_empty() {
                continue;
            }
            representatives
                .entry(entry.data_directory.as_str())
                .and_modify(|current| {
                    if label.as_str() < *current {
                        *current = label.as_str();
                    }
                })
                .or_insert(label.as_str());
        }
        let mut result: Vec<(String, String)> = representatives
            .into_iter()
            .map(|(dir, label)| (dir.to_string(), label.to_string()))
            .collect();
        result.sort();
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_registry() -> WebviewRegistry {
        WebviewRegistry {
            entries: HashMap::new(),
        }
    }

    #[test]
    fn register_したlabelでaccount_idとdata_directoryが取得できる() {
        let mut registry = new_registry();
        registry.register(
            "col-1".to_string(),
            "column-1".to_string(),
            "account-1".to_string(),
            "/data/dir/1".to_string(),
        );
        assert_eq!(registry.get_account_id("col-1"), Some("account-1"));
        assert_eq!(registry.get_data_directory("col-1"), Some("/data/dir/1"));
    }

    #[test]
    fn unregister_したlabelはget系がnoneを返す() {
        let mut registry = new_registry();
        registry.register(
            "col-1".to_string(),
            "column-1".to_string(),
            "account-1".to_string(),
            "/data/dir/1".to_string(),
        );
        registry.unregister("col-1");
        assert_eq!(registry.get_account_id("col-1"), None);
        assert_eq!(registry.get_data_directory("col-1"), None);
    }

    #[test]
    fn 未登録のlabelはget系がnoneを返す() {
        let registry = new_registry();
        assert_eq!(registry.get_account_id("unknown"), None);
        assert_eq!(registry.get_data_directory("unknown"), None);
    }

    #[test]
    fn 存在しないlabelをunregisterしてもパニックしない() {
        let mut registry = new_registry();
        registry.unregister("unknown");
        assert_eq!(registry.get_account_id("unknown"), None);
    }

    #[test]
    fn 同一labelをregisterすると最新の値で上書きされる() {
        let mut registry = new_registry();
        registry.register(
            "col-1".to_string(),
            "column-1".to_string(),
            "account-old".to_string(),
            "/data/dir/old".to_string(),
        );
        registry.register(
            "col-1".to_string(),
            "column-1".to_string(),
            "account-new".to_string(),
            "/data/dir/new".to_string(),
        );
        assert_eq!(registry.get_account_id("col-1"), Some("account-new"));
        assert_eq!(registry.get_data_directory("col-1"), Some("/data/dir/new"));
        assert_eq!(registry.entries.len(), 1);
    }

    #[test]
    fn 複数のlabelを独立して登録できる() {
        let mut registry = new_registry();
        registry.register(
            "col-1".to_string(),
            "column-1".to_string(),
            "account-1".to_string(),
            "/data/dir/1".to_string(),
        );
        registry.register(
            "col-2".to_string(),
            "column-2".to_string(),
            "account-2".to_string(),
            "/data/dir/2".to_string(),
        );
        assert_eq!(registry.get_account_id("col-1"), Some("account-1"));
        assert_eq!(registry.get_account_id("col-2"), Some("account-2"));
        registry.unregister("col-1");
        assert_eq!(registry.get_account_id("col-1"), None);
        assert_eq!(registry.get_account_id("col-2"), Some("account-2"));
    }

    #[test]
    fn app_state_newは空のregistryを持つ() {
        let state = AppState::new();
        let registry = state.registry.lock().unwrap();
        assert!(registry.entries.is_empty());
    }

    #[test]
    fn app_state_newはcomposeがnoneである() {
        let state = AppState::new();
        let compose = state.compose.lock().unwrap();
        assert!(compose.is_none());
    }

    #[test]
    fn app_state_newは公式設定ポップアップ追跡ラベルがnoneである() {
        let state = AppState::new();
        let label = state.official_settings_popup_label.lock().unwrap();
        assert!(label.is_none());
    }

    #[test]
    fn decide_compose_actionは常駐なしのときcreate_newを返す() {
        let action = decide_compose_action(None, "account-1");
        assert_eq!(action, ComposeAction::CreateNew);
    }

    #[test]
    fn decide_compose_actionは同一アカウントのときreuseを返しlabelが一致する() {
        let current = ComposeSession {
            label: "compose-1".to_string(),
            account_id: "account-1".to_string(),
        };
        let action = decide_compose_action(Some(&current), "account-1");
        assert_eq!(
            action,
            ComposeAction::Reuse {
                label: "compose-1".to_string()
            }
        );
    }

    #[test]
    fn decide_compose_actionは別アカウントのときreplaceを返しold_labelが旧常駐のlabelである() {
        let current = ComposeSession {
            label: "compose-1".to_string(),
            account_id: "account-old".to_string(),
        };
        let action = decide_compose_action(Some(&current), "account-new");
        assert_eq!(
            action,
            ComposeAction::Replace {
                old_label: "compose-1".to_string()
            }
        );
    }

    #[test]
    fn is_persistent_compose_labelは常駐なしのときfalseを返す() {
        assert!(!is_persistent_compose_label(None, "compose-1"));
    }

    #[test]
    fn is_persistent_compose_labelは常駐labelと一致するときtrueを返す() {
        let current = ComposeSession {
            label: "compose-1".to_string(),
            account_id: "account-1".to_string(),
        };
        assert!(is_persistent_compose_label(Some(&current), "compose-1"));
    }

    #[test]
    fn is_persistent_compose_labelは常駐labelと不一致のときfalseを返す() {
        let current = ComposeSession {
            label: "compose-1".to_string(),
            account_id: "account-1".to_string(),
        };
        assert!(!is_persistent_compose_label(Some(&current), "popup-2"));
    }

    #[test]
    fn data_directoryで重複排除し代表labelは辞書順最小になる() {
        let mut registry = new_registry();
        for (label, dir) in [
            ("c-2", "/d/b"),
            ("c-1", "/d/b"),
            ("c-3", "/d/a"),
            ("c-0", ""),
        ] {
            registry.register(label.into(), "col".into(), "acc".into(), dir.into());
        }
        assert_eq!(
            registry.distinct_data_directories(),
            vec![
                ("/d/a".to_string(), "c-3".to_string()),
                ("/d/b".to_string(), "c-1".to_string()),
            ]
        );
    }

    #[test]
    fn 空のregistryではdistinct_data_directoriesが空になる() {
        assert!(new_registry().distinct_data_directories().is_empty());
    }
}

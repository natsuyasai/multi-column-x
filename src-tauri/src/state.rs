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

pub struct AppState {
    pub registry: Mutex<WebviewRegistry>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            registry: Mutex::new(WebviewRegistry {
                entries: HashMap::new(),
            }),
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
}

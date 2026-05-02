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
    pub fn register(&mut self, label: String, column_id: String, account_id: String, data_directory: String) {
        self.entries.insert(label, WebviewEntry {
            column_id,
            account_id,
            data_directory,
        });
    }

    pub fn unregister(&mut self, label: &str) {
        self.entries.remove(label);
    }

    #[allow(dead_code)]
    pub fn get_account_id(&self, label: &str) -> Option<&str> {
        self.entries.get(label).map(|e| e.account_id.as_str())
    }

    pub fn get_data_directory(&self, label: &str) -> Option<&str> {
        self.entries.get(label).map(|e| e.data_directory.as_str())
    }
}

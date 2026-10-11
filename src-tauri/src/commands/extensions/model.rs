//! ブラウザ拡張機能のデータモデル。JS から読むため camelCase で直列化する。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Chromium 系ブラウザの種別（検出元）。保存データに無いときは Chrome。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Browser {
    #[default]
    Chrome,
    Edge,
}

/// 拡張機能の取得元。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExtensionSource {
    /// ユーザーが指定した展開済みフォルダ。
    Folder { path: String },
    /// Chrome のインストール先から検出した拡張機能。
    Chrome {
        #[serde(rename = "chromeId")]
        chrome_id: String,
        /// 例: "Default"
        profile: String,
        /// 検出元のブラウザ。旧データ（キー無し）は Chrome。
        #[serde(default)]
        browser: Browser,
    },
}

/// アプリが管理する拡張機能 1 件。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtensionEntry {
    /// アプリ側 UUID（WebView2 の ID とは別）。
    pub id: String,
    /// 表示名（多言語解決済み）。
    pub name: String,
    pub source: ExtensionSource,
    pub enabled: bool,
    #[serde(rename = "hasPopup", default)]
    pub has_popup: bool,
    #[serde(rename = "hasOptions", default)]
    pub has_options: bool,
    /// Chrome 側から消えている（見つからない）。reconcile では無効として扱う。
    #[serde(default)]
    pub missing: bool,
}

/// プロファイル（data_directory）に適用済みの拡張機能。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppliedExtension {
    #[serde(rename = "appliedPath", default)]
    pub applied_path: String,
    /// WebView2 が払い出した拡張機能 ID。
    #[serde(rename = "webviewId", default)]
    pub webview_id: String,
}

/// data_directory 単位の適用状況。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ProfileSync {
    #[serde(rename = "dataDirectory", default)]
    pub data_directory: String,
    /// キーは `ExtensionEntry::id`。
    #[serde(default)]
    pub entries: HashMap<String, AppliedExtension>,
}

/// `settings.json` の `browserExtensions` キーに保存する全体状態。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ExtensionsState {
    #[serde(default)]
    pub entries: Vec<ExtensionEntry>,
    #[serde(default)]
    pub profiles: Vec<ProfileSync>,
}

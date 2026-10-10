//! 拡張機能の状態を `settings.json` の `browserExtensions` キーへ読み書きする。
//! `appSettings` とは独立したキーで、端末固有のパスを含むためバックアップ対象外。

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::model::ExtensionsState;

/// ストア内のキー名。
pub const STORE_KEY: &str = "browserExtensions";
const STORE_FILE: &str = "settings.json";

/// 破損した `browserExtensions` を退避するキー名（1 世代のみ保持し、次の破損で上書きする）。
pub const BROKEN_KEY: &str = "browserExtensionsBroken";

/// 保存値を状態へ変換し、破損していた場合はその元の値も返す（退避用）。
/// キー無し・`null` は破損ではない。壊れた値は空状態にフォールバックする。
pub fn split_stored_value(value: Option<Value>) -> (ExtensionsState, Option<Value>) {
    match value {
        None | Some(Value::Null) => (ExtensionsState::default(), None),
        Some(v) => match serde_json::from_value(v.clone()) {
            Ok(state) => (state, None),
            Err(e) => {
                log::warn!("拡張機能の設定の読み込みに失敗したため空状態で続行します: {e}");
                (ExtensionsState::default(), Some(v))
            }
        },
    }
}

/// 保存値を状態へ変換する（退避値を捨てる版。テストで使う）。
#[cfg(test)]
pub fn state_from_value(value: Option<Value>) -> ExtensionsState {
    split_stored_value(value).0
}

/// 状態を保存用の値へ変換する。
pub fn state_to_value(state: &ExtensionsState) -> Result<Value, String> {
    serde_json::to_value(state).map_err(|e| e.to_string())
}

/// 保存済みの拡張機能の状態を読み込む。
pub fn load(app: &AppHandle) -> Result<ExtensionsState, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let (state, broken) = split_stored_value(store.get(STORE_KEY));
    if let Some(broken) = broken {
        // 次の保存で破損値が上書きされて失われないよう、別キーへ退避する（1 世代）。
        store.set(BROKEN_KEY, broken);
        if let Err(e) = crate::commands::settings_file::save_store_atomically(app, &store) {
            log::warn!("破損した拡張機能の設定の退避保存に失敗しました: {e}");
        }
    }
    Ok(state)
}

/// 拡張機能の状態を保存する（`Store::save` ではなくアトミック保存を使う）。
pub fn save(app: &AppHandle, state: &ExtensionsState) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(STORE_KEY, state_to_value(state)?);
    crate::commands::settings_file::save_store_atomically(app, &store)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use super::super::model::{
        AppliedExtension, Browser, ExtensionEntry, ExtensionSource, ProfileSync,
    };
    use super::*;

    fn 複数種類の状態() -> ExtensionsState {
        let mut applied = HashMap::new();
        applied.insert(
            "entry-b".to_string(),
            AppliedExtension {
                applied_path: "C:\\ext\\b\\1.0_0".to_string(),
                webview_id: "abcdefghijklmnopabcdefghijklmnop".to_string(),
            },
        );
        ExtensionsState {
            entries: vec![
                ExtensionEntry {
                    id: "entry-a".to_string(),
                    name: "フォルダ拡張".to_string(),
                    source: ExtensionSource::Folder {
                        path: "C:\\ext\\a".to_string(),
                    },
                    enabled: true,
                    has_popup: true,
                    has_options: false,
                    missing: false,
                },
                ExtensionEntry {
                    id: "entry-b".to_string(),
                    name: "Chrome拡張".to_string(),
                    source: ExtensionSource::Chrome {
                        chrome_id: "abcdefghijklmnopabcdefghijklmnop".to_string(),
                        profile: "Default".to_string(),
                        browser: Browser::Chrome,
                    },
                    enabled: false,
                    has_popup: false,
                    has_options: true,
                    missing: true,
                },
            ],
            profiles: vec![ProfileSync {
                data_directory: "C:\\data\\acc1".to_string(),
                entries: applied,
            }],
        }
    }

    #[test]
    fn 追加した拡張機能の一覧と有効無効の状態は再起動後も保持される() {
        let before = 複数種類の状態();

        // 保存 → ファイルに書かれた JSON 文字列 → 再起動後の読み込み、を再現する
        let saved = serde_json::to_string(&state_to_value(&before).unwrap()).unwrap();
        let reloaded = state_from_value(Some(serde_json::from_str(&saved).unwrap()));

        assert_eq!(reloaded, before);
        assert_eq!(
            reloaded
                .entries
                .iter()
                .map(|e| e.enabled)
                .collect::<Vec<_>>(),
            vec![true, false]
        );
    }

    #[test]
    fn 再起動後もmissingとプロファイルの適用状況が保持される() {
        let reloaded = state_from_value(Some(state_to_value(&複数種類の状態()).unwrap()));

        assert!(reloaded.entries[1].missing);
        assert_eq!(reloaded.profiles.len(), 1);
        assert_eq!(reloaded.profiles[0].data_directory, "C:\\data\\acc1");
        assert_eq!(
            reloaded.profiles[0].entries["entry-b"].applied_path,
            "C:\\ext\\b\\1.0_0"
        );
    }

    #[test]
    fn 保存キーが無いときは空状態になる() {
        assert_eq!(state_from_value(None), ExtensionsState::default());
    }

    #[test]
    fn 保存値が壊れているときは空状態になる() {
        for broken in [
            json!("文字列"),
            json!(42),
            json!({"entries": "壊れ"}),
            json!(null),
        ] {
            assert_eq!(state_from_value(Some(broken)), ExtensionsState::default());
        }
    }

    #[test]
    fn 破損した保存値は空状態と退避すべき元の値に分けられる() {
        for broken in [
            json!("文字列"),
            json!(42),
            json!({"entries": "壊れ"}),
            json!([1, 2]),
        ] {
            let (state, escrow) = split_stored_value(Some(broken.clone()));
            assert_eq!(state, ExtensionsState::default());
            assert_eq!(escrow, Some(broken));
        }
    }

    #[test]
    fn キー無しとnullと正常な値では退避しない() {
        assert_eq!(split_stored_value(None), (ExtensionsState::default(), None));
        assert_eq!(
            split_stored_value(Some(json!(null))),
            (ExtensionsState::default(), None)
        );
        let normal = state_to_value(&複数種類の状態()).unwrap();
        let (state, escrow) = split_stored_value(Some(normal));
        assert_eq!(state, 複数種類の状態());
        assert_eq!(escrow, None);
    }

    #[test]
    fn 退避キーは他のキーと別である() {
        assert_eq!(BROKEN_KEY, "browserExtensionsBroken");
        assert_ne!(BROKEN_KEY, STORE_KEY);
        assert_ne!(BROKEN_KEY, "appSettings");
    }

    #[test]
    fn 欠落したフィールドは既定値で補われる() {
        let state = state_from_value(Some(json!({
            "entries": [{
                "id": "e1",
                "name": "n",
                "source": {"kind": "folder", "path": "C:\\x"},
                "enabled": true
            }]
        })));

        assert_eq!(state.entries.len(), 1);
        assert!(!state.entries[0].has_popup);
        assert!(!state.entries[0].has_options);
        assert!(!state.entries[0].missing);
        assert!(state.profiles.is_empty());
    }

    #[test]
    fn 未知のフィールドがあっても読み込める() {
        let state = state_from_value(Some(json!({
            "entries": [],
            "profiles": [],
            "futureField": 1
        })));
        assert_eq!(state, ExtensionsState::default());
    }

    #[test]
    fn jsから読む形式はcamelcaseで直列化される() {
        let value = state_to_value(&複数種類の状態()).unwrap();

        let folder = &value["entries"][0];
        assert_eq!(folder["hasPopup"], json!(true));
        assert_eq!(folder["hasOptions"], json!(false));
        assert_eq!(folder["source"]["kind"], json!("folder"));
        assert_eq!(folder["source"]["path"], json!("C:\\ext\\a"));
        let chrome = &value["entries"][1];
        assert_eq!(chrome["source"]["kind"], json!("chrome"));
        assert_eq!(
            chrome["source"]["chromeId"],
            json!("abcdefghijklmnopabcdefghijklmnop")
        );
        let profile = &value["profiles"][0];
        assert_eq!(profile["dataDirectory"], json!("C:\\data\\acc1"));
        assert_eq!(
            profile["entries"]["entry-b"]["appliedPath"],
            json!("C:\\ext\\b\\1.0_0")
        );
        assert!(profile["entries"]["entry-b"]["webviewId"].is_string());
    }

    // 他機能の保存処理（save_settings / apply_restore）は `appSettings` キーだけを書き換え、
    // `browserExtensions` を set / delete しないこと。`save_store_atomically` はストアの
    // 全エントリを書き出すため、触れなければキーは残る。
    fn 本番コードのみ(source: &str) -> &str {
        source
            .split(
                "#[cfg(test)]
mod tests",
            )
            .next()
            .unwrap()
    }

    fn 書き換えられるキー一覧(source: &str) -> Vec<String> {
        let mut keys = Vec::new();
        for call in ["store.set(", "store.delete("] {
            for part in source.split(call).skip(1) {
                let rest = part.trim_start();
                let key = rest
                    .strip_prefix('"')
                    .and_then(|r| r.split('"').next())
                    .unwrap_or("<非リテラル>");
                keys.push(key.to_string());
            }
        }
        keys
    }

    #[test]
    fn save_settingsはappsettingsキーだけを書き換える() {
        let source = 本番コードのみ(include_str!("../settings.rs"));
        let keys = 書き換えられるキー一覧(source);
        assert!(!keys.is_empty());
        assert!(keys.iter().all(|k| k == "appSettings"), "{keys:?}");
    }

    #[test]
    fn apply_restoreはappsettingsキーだけを書き換える() {
        let source = 本番コードのみ(include_str!("../backup/mod.rs"));
        let keys = 書き換えられるキー一覧(source);
        assert!(!keys.is_empty());
        assert!(keys.iter().all(|k| k == "appSettings"), "{keys:?}");
    }

    #[test]
    fn 拡張機能のキーはappsettingsと別である() {
        assert_eq!(STORE_KEY, "browserExtensions");
        assert_ne!(STORE_KEY, "appSettings");
    }
}

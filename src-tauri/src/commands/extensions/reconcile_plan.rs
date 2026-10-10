//! 拡張機能の同期計画（reconcile）の純粋ロジック（OS 非依存・I/O 注入）。
//! WebView2 の呼び出しは一切含めず、「何を Add / Remove / SetEnabled すべきか」だけを決める。
// `prune_profiles` は全アカウントの data_directory 一覧が必要なため、まだ呼び出し元が無い。
#![allow(dead_code)]

use std::collections::{HashMap, HashSet};
use std::path::Path;

use super::chrome::resolve_chrome_extension_path;
use super::manifest::read_manifest_info;
use super::model::{
    AppliedExtension, ExtensionEntry, ExtensionSource, ExtensionsState, ProfileSync,
};
use super::sanitize::prepare_extension_dir;

/// エントリの読み込み元フォルダの解決結果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedEntry {
    /// 読み込むべきフォルダ（予約名があればサニタイズコピー先）。
    Path(String),
    /// 見つからない（Chrome から消えた / 元フォルダか manifest.json が無い / Chrome 未検出）。
    Missing,
    /// 解決中のエラー（コピー失敗など）。
    Error(String),
}

/// WebView2 に現在インストールされている拡張機能。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledExt {
    pub id: String,
    pub enabled: bool,
}

/// 計画された操作。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// 追加する。`replaces` があれば先に旧 ID を削除する。
    /// 追加後の有効状態は実行側が `desired_enabled` に合わせる。
    Add {
        entry_id: String,
        path: String,
        replaces: Option<String>,
        desired_enabled: bool,
    },
    Remove {
        webview_id: String,
    },
    SetEnabled {
        webview_id: String,
        enabled: bool,
    },
}

/// エントリの読み込み元フォルダを解決する。
pub fn resolve_entry(
    entry: &ExtensionEntry,
    chrome_root: Option<&Path>,
    copy_root: &Path,
) -> ResolvedEntry {
    let source_dir = match &entry.source {
        ExtensionSource::Folder { path } => {
            let dir = Path::new(path);
            if !dir.join("manifest.json").is_file() {
                return ResolvedEntry::Missing;
            }
            dir.to_path_buf()
        }
        ExtensionSource::Chrome { chrome_id, .. } => {
            let Some(root) = chrome_root else {
                return ResolvedEntry::Missing;
            };
            match resolve_chrome_extension_path(root, chrome_id) {
                Some(dir) => dir,
                None => return ResolvedEntry::Missing,
            }
        }
    };
    match prepare_extension_dir(&source_dir, copy_root, &entry.id) {
        Ok(prepared) => ResolvedEntry::Path(prepared.path.to_string_lossy().into_owned()),
        Err(e) => ResolvedEntry::Error(e.to_string()),
    }
}

/// プロファイル 1 件分の操作計画を作る。
///
/// アプリが把握していない `installed`（既定の Microsoft 拡張など）には一切触れない。
pub fn plan_profile(
    entries: &[ExtensionEntry],
    resolved: &HashMap<String, ResolvedEntry>,
    applied: &HashMap<String, AppliedExtension>,
    installed: &[InstalledExt],
) -> Vec<Action> {
    let installed_map: HashMap<&str, bool> = installed
        .iter()
        .map(|i| (i.id.as_str(), i.enabled))
        .collect();
    let mut actions = Vec::new();

    for entry in entries {
        let applied_entry = applied.get(&entry.id);
        let applied_installed = applied_entry
            .filter(|a| !a.webview_id.is_empty())
            .and_then(|a| installed_map.get(a.webview_id.as_str()).map(|e| (a, *e)));

        match resolved.get(&entry.id) {
            Some(ResolvedEntry::Path(path)) => match applied_installed {
                Some((a, current_enabled)) if a.applied_path == *path => {
                    if current_enabled != entry.enabled {
                        actions.push(Action::SetEnabled {
                            webview_id: a.webview_id.clone(),
                            enabled: entry.enabled,
                        });
                    }
                }
                other => actions.push(Action::Add {
                    entry_id: entry.id.clone(),
                    path: path.clone(),
                    replaces: other.map(|(a, _)| a.webview_id.clone()),
                    desired_enabled: entry.enabled,
                }),
            },
            Some(ResolvedEntry::Missing) => {
                if let Some((a, true)) = applied_installed {
                    actions.push(Action::SetEnabled {
                        webview_id: a.webview_id.clone(),
                        enabled: false,
                    });
                }
            }
            // Error / 未解決は何もしない。
            Some(ResolvedEntry::Error(_)) | None => {}
        }
    }

    // エントリ一覧から消えたものは削除する（決定的な順序にする）。
    let known: HashSet<&str> = entries.iter().map(|e| e.id.as_str()).collect();
    let mut removed: Vec<&String> = applied
        .keys()
        .filter(|id| !known.contains(id.as_str()))
        .collect();
    removed.sort();
    for entry_id in removed {
        let a = &applied[entry_id];
        if installed_map.contains_key(a.webview_id.as_str()) {
            actions.push(Action::Remove {
                webview_id: a.webview_id.clone(),
            });
        }
    }
    actions
}

/// Add 成功を反映する（旧 ID は上書きされる）。
pub fn apply_add_result(
    profile: &mut ProfileSync,
    entry_id: &str,
    applied_path: &str,
    new_webview_id: &str,
) {
    profile.entries.insert(
        entry_id.to_string(),
        AppliedExtension {
            applied_path: applied_path.to_string(),
            webview_id: new_webview_id.to_string(),
        },
    );
}

/// Remove 成功を反映する。
pub fn apply_remove_result(profile: &mut ProfileSync, webview_id: &str) {
    profile.entries.retain(|_, a| a.webview_id != webview_id);
}

/// 存在しない `data_directory` の `ProfileSync` を除去する。
///
/// 稼働中でないだけのアカウントの記録を消さないよう、`live_data_directories` には
/// 「稼働中の WebView」ではなく「全アカウントの data_directory」を渡すこと。
pub fn prune_profiles(profiles: &mut Vec<ProfileSync>, live_data_directories: &HashSet<String>) {
    profiles.retain(|p| live_data_directories.contains(&p.data_directory));
}

/// `data_directory` の `ProfileSync` を返す（無ければ作成する）。
pub fn profile_for_mut<'a>(
    state: &'a mut ExtensionsState,
    data_directory: &str,
) -> &'a mut ProfileSync {
    let index = match state
        .profiles
        .iter()
        .position(|p| p.data_directory == data_directory)
    {
        Some(i) => i,
        None => {
            state.profiles.push(ProfileSync {
                data_directory: data_directory.to_string(),
                ..Default::default()
            });
            state.profiles.len() - 1
        }
    };
    &mut state.profiles[index]
}

/// `missing` フラグを解決結果に合わせる。変化があれば true。
/// `Error` や未解決のエントリは前回の状態を維持する。
pub fn refresh_missing(
    entries: &mut [ExtensionEntry],
    resolved: &HashMap<String, ResolvedEntry>,
) -> bool {
    let mut changed = false;
    for entry in entries {
        let missing = match resolved.get(&entry.id) {
            Some(ResolvedEntry::Missing) => true,
            Some(ResolvedEntry::Path(_)) => false,
            _ => continue,
        };
        if entry.missing != missing {
            entry.missing = missing;
            changed = true;
        }
    }
    changed
}

/// Chrome 由来のエントリについて、manifest から `name` / `has_popup` / `has_options` を更新する
/// （バージョン更新で変わり得るため）。変化があれば true。
pub fn refresh_metadata(
    entry: &mut ExtensionEntry,
    resolved_path: &Path,
    preferred_locale: &str,
) -> bool {
    if !matches!(entry.source, ExtensionSource::Chrome { .. }) {
        return false;
    }
    let Ok(info) = read_manifest_info(resolved_path, preferred_locale) else {
        return false;
    };
    let changed = entry.name != info.name
        || entry.has_popup != info.has_popup
        || entry.has_options != info.has_options;
    entry.name = info.name;
    entry.has_popup = info.has_popup;
    entry.has_options = info.has_options;
    changed
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    const ID_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn フォルダ拡張(id: &str, path: &str, enabled: bool) -> ExtensionEntry {
        ExtensionEntry {
            id: id.to_string(),
            name: id.to_string(),
            source: ExtensionSource::Folder {
                path: path.to_string(),
            },
            enabled,
            has_popup: false,
            has_options: false,
            missing: false,
        }
    }

    fn chrome拡張(id: &str, chrome_id: &str, enabled: bool) -> ExtensionEntry {
        ExtensionEntry {
            source: ExtensionSource::Chrome {
                chrome_id: chrome_id.to_string(),
                profile: "Default".to_string(),
            },
            ..フォルダ拡張(id, "", enabled)
        }
    }

    fn 適用済み(path: &str, webview_id: &str) -> AppliedExtension {
        AppliedExtension {
            applied_path: path.to_string(),
            webview_id: webview_id.to_string(),
        }
    }

    fn 導入済み(id: &str, enabled: bool) -> InstalledExt {
        InstalledExt {
            id: id.to_string(),
            enabled,
        }
    }

    fn 解決(pairs: &[(&str, ResolvedEntry)]) -> HashMap<String, ResolvedEntry> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    fn 適用map(pairs: &[(&str, AppliedExtension)]) -> HashMap<String, AppliedExtension> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    fn chromeに置く(root: &Path, id: &str, version: &str) -> PathBuf {
        let dir = root.join(id).join(version);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), r#"{"name":"X"}"#).unwrap();
        dir
    }

    fn パス文字列(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn 拡張機能を追加済みのとき新しく追加したアカウントでも利用できる() {
        let entries = vec![
            フォルダ拡張("e1", "/ext/one", true),
            フォルダ拡張("e2", "/ext/two", false),
        ];
        let resolved = 解決(&[
            ("e1", ResolvedEntry::Path("/ext/one".into())),
            ("e2", ResolvedEntry::Path("/ext/two".into())),
        ]);
        // 新しいアカウントのプロファイルは適用済みが空で、既定拡張だけが入っている。
        let plan = plan_profile(
            &entries,
            &resolved,
            &HashMap::new(),
            &[導入済み("ms-default", true)],
        );
        assert_eq!(
            plan,
            vec![
                Action::Add {
                    entry_id: "e1".into(),
                    path: "/ext/one".into(),
                    replaces: None,
                    desired_enabled: true
                },
                Action::Add {
                    entry_id: "e2".into(),
                    path: "/ext/two".into(),
                    replaces: None,
                    desired_enabled: false
                },
            ]
        );
    }

    #[test]
    fn 追加した後に元のフォルダを変更しても拡張機能の動作に影響しない() {
        let entries = vec![フォルダ拡張("e1", "/ext/one", true)];
        let resolved = 解決(&[("e1", ResolvedEntry::Path("/ext/one".into()))]);
        let applied = 適用map(&[("e1", 適用済み("/ext/one", "w1"))]);
        let plan = plan_profile(&entries, &resolved, &applied, &[導入済み("w1", true)]);
        assert!(plan.is_empty());
    }

    #[test]
    fn 起動時にchromeの拡張機能の最新バージョンへ自動で付け替わる() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("Extensions");
        let old = chromeに置く(&root, ID_A, "1.0_0");
        let copy_root = tmp.path().join("copies");
        let entry = chrome拡張("e1", ID_A, true);
        let applied = 適用map(&[("e1", 適用済み(&パス文字列(&old), "w-old"))]);
        let installed = [導入済み("w-old", true)];

        // Chrome が更新されて新しいバージョンフォルダができた。
        let new = chromeに置く(&root, ID_A, "1.1_0");
        let r = resolve_entry(&entry, Some(&root), &copy_root);
        assert_eq!(r, ResolvedEntry::Path(パス文字列(&new)));

        let plan = plan_profile(
            std::slice::from_ref(&entry),
            &解決(&[("e1", r)]),
            &applied,
            &installed,
        );
        assert_eq!(
            plan,
            vec![Action::Add {
                entry_id: "e1".into(),
                path: パス文字列(&new),
                replaces: Some("w-old".into()),
                desired_enabled: true
            }]
        );
    }

    #[test]
    fn 起動時に同期した拡張機能の有効無効の状態は維持される() {
        let entries = vec![chrome拡張("e1", ID_A, false)];
        let resolved = 解決(&[("e1", ResolvedEntry::Path("/new".into()))]);
        let applied = 適用map(&[("e1", 適用済み("/old", "w-old"))]);
        let plan = plan_profile(&entries, &resolved, &applied, &[導入済み("w-old", false)]);
        match plan.as_slice() {
            [Action::Add {
                desired_enabled, ..
            }] => assert!(!desired_enabled),
            other => panic!("想定外の計画: {other:?}"),
        }
    }

    #[test]
    fn chrome側で拡張機能が削除されたときは見つかりません表示で無効になる() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("Extensions");
        fs::create_dir_all(&root).unwrap();
        let mut entries = vec![chrome拡張("e1", ID_A, true)];

        let r = resolve_entry(&entries[0], Some(&root), &tmp.path().join("copies"));
        assert_eq!(r, ResolvedEntry::Missing);
        let resolved = 解決(&[("e1", r)]);

        assert!(refresh_missing(&mut entries, &resolved));
        assert!(entries[0].missing);

        let applied = 適用map(&[("e1", 適用済み("/old", "w1"))]);
        let plan = plan_profile(&entries, &resolved, &applied, &[導入済み("w1", true)]);
        assert_eq!(
            plan,
            vec![Action::SetEnabled {
                webview_id: "w1".into(),
                enabled: false
            }]
        );
    }

    #[test]
    fn 既定で組み込まれている拡張機能は一覧に表示されない() {
        let entries = vec![フォルダ拡張("e1", "/ext/one", true)];
        let resolved = 解決(&[("e1", ResolvedEntry::Path("/ext/one".into()))]);
        let applied = 適用map(&[("e1", 適用済み("/ext/one", "w1"))]);
        // アプリが把握していない既定拡張は無効でも、どの操作の対象にもならない。
        let installed = [導入済み("w1", true), 導入済み("ms-default", false)];
        let plan = plan_profile(&entries, &resolved, &applied, &installed);
        assert!(plan.is_empty());

        // エントリが全て消えても未把握の拡張は Remove されない。
        let plan = plan_profile(&[], &HashMap::new(), &HashMap::new(), &installed);
        assert!(plan.is_empty());
    }

    #[test]
    fn 拡張機能を無効にすると全アカウントで無効になる() {
        let entries = vec![フォルダ拡張("e1", "/ext/one", false)];
        let resolved = 解決(&[("e1", ResolvedEntry::Path("/ext/one".into()))]);
        for wid in ["w-acc1", "w-acc2"] {
            let applied = 適用map(&[("e1", 適用済み("/ext/one", wid))]);
            let plan = plan_profile(&entries, &resolved, &applied, &[導入済み(wid, true)]);
            assert_eq!(
                plan,
                vec![Action::SetEnabled {
                    webview_id: wid.into(),
                    enabled: false
                }]
            );
        }
    }

    #[test]
    fn 無効にした拡張機能を有効に戻せる() {
        let entries = vec![フォルダ拡張("e1", "/ext/one", true)];
        let resolved = 解決(&[("e1", ResolvedEntry::Path("/ext/one".into()))]);
        for wid in ["w-acc1", "w-acc2"] {
            let applied = 適用map(&[("e1", 適用済み("/ext/one", wid))]);
            let plan = plan_profile(&entries, &resolved, &applied, &[導入済み(wid, false)]);
            assert_eq!(
                plan,
                vec![Action::SetEnabled {
                    webview_id: wid.into(),
                    enabled: true
                }]
            );
        }
    }

    #[test]
    fn 拡張機能を削除すると全アカウントから削除される() {
        for wid in ["w-acc1", "w-acc2"] {
            let applied = 適用map(&[("e1", 適用済み("/ext/one", wid))]);
            let plan = plan_profile(
                &[],
                &HashMap::new(),
                &applied,
                &[導入済み(wid, true), 導入済み("ms-default", true)],
            );
            assert_eq!(
                plan,
                vec![Action::Remove {
                    webview_id: wid.into()
                }]
            );
        }
    }

    // ---- シナリオ外の追加テスト ----

    #[test]
    fn 計画を適用した後に再度計画すると空になる() {
        let entries = vec![
            フォルダ拡張("e1", "/new1", true),
            フォルダ拡張("e2", "/p2", false),
            フォルダ拡張("e3", "/p3", true),
            フォルダ拡張("e4", "/gone", true),
        ];
        let resolved = 解決(&[
            ("e1", ResolvedEntry::Path("/new1".into())),
            ("e2", ResolvedEntry::Path("/p2".into())),
            ("e3", ResolvedEntry::Missing),
            ("e4", ResolvedEntry::Error("x".into())),
        ]);
        let mut applied = 適用map(&[
            ("e1", 適用済み("/old1", "w1")),
            ("e3", 適用済み("/p3", "w3")),
            ("removed", 適用済み("/r", "wr")),
        ]);
        let mut installed = vec![
            導入済み("w1", true),
            導入済み("w3", true),
            導入済み("wr", true),
            導入済み("ms", true),
        ];

        let plan = plan_profile(&entries, &resolved, &applied, &installed);
        assert!(!plan.is_empty());
        let mut next_id = 0;
        for action in plan {
            match action {
                Action::Add {
                    entry_id,
                    path,
                    replaces,
                    desired_enabled,
                } => {
                    if let Some(old) = replaces {
                        installed.retain(|i| i.id != old);
                    }
                    next_id += 1;
                    let wid = format!("new{next_id}");
                    installed.push(導入済み(&wid, desired_enabled));
                    applied.insert(entry_id, 適用済み(&path, &wid));
                }
                Action::Remove { webview_id } => {
                    installed.retain(|i| i.id != webview_id);
                    applied.retain(|_, a| a.webview_id != webview_id);
                }
                Action::SetEnabled {
                    webview_id,
                    enabled,
                } => {
                    for i in installed.iter_mut().filter(|i| i.id == webview_id) {
                        i.enabled = enabled;
                    }
                }
            }
        }
        assert_eq!(plan_profile(&entries, &resolved, &applied, &installed), []);
    }

    #[test]
    fn 削除されたエントリの適用済みidがインストール済みでなければ削除しない() {
        let applied = 適用map(&[("gone", 適用済み("/p", "w-stale"))]);
        let plan = plan_profile(&[], &HashMap::new(), &applied, &[導入済み("ms", true)]);
        assert!(plan.is_empty());
    }

    #[test]
    fn 解決でエラーになったエントリは何もしない() {
        let entries = vec![フォルダ拡張("e1", "/ext/one", false)];
        let resolved = 解決(&[("e1", ResolvedEntry::Error("copy failed".into()))]);
        let applied = 適用map(&[("e1", 適用済み("/old", "w1"))]);
        let plan = plan_profile(&entries, &resolved, &applied, &[導入済み("w1", true)]);
        assert!(plan.is_empty());
        let plan = plan_profile(&entries, &resolved, &HashMap::new(), &[]);
        assert!(plan.is_empty());
    }

    #[test]
    fn パスが変わっても旧idがインストール済みでなければ置換元にしない() {
        let entries = vec![フォルダ拡張("e1", "/new", true)];
        let resolved = 解決(&[("e1", ResolvedEntry::Path("/new".into()))]);
        let applied = 適用map(&[("e1", 適用済み("/old", "w-stale"))]);
        let plan = plan_profile(&entries, &resolved, &applied, &[導入済み("other", true)]);
        assert_eq!(
            plan,
            vec![Action::Add {
                entry_id: "e1".into(),
                path: "/new".into(),
                replaces: None,
                desired_enabled: true
            }]
        );
    }

    #[test]
    fn パスが同じでも適用済みidがインストール済みでなければ再追加する() {
        let entries = vec![フォルダ拡張("e1", "/p", true)];
        let resolved = 解決(&[("e1", ResolvedEntry::Path("/p".into()))]);
        let applied = 適用map(&[("e1", 適用済み("/p", "w-stale"))]);
        let plan = plan_profile(&entries, &resolved, &applied, &[]);
        assert_eq!(
            plan,
            vec![Action::Add {
                entry_id: "e1".into(),
                path: "/p".into(),
                replaces: None,
                desired_enabled: true
            }]
        );
    }

    #[test]
    fn 見つからない拡張機能が既に無効なら何もしない() {
        let entries = vec![フォルダ拡張("e1", "/p", true)];
        let resolved = 解決(&[("e1", ResolvedEntry::Missing)]);
        let applied = 適用map(&[("e1", 適用済み("/p", "w1"))]);
        let plan = plan_profile(&entries, &resolved, &applied, &[導入済み("w1", false)]);
        assert!(plan.is_empty());
    }

    #[test]
    fn フォルダ指定の元フォルダまたはmanifestが無いときは見つからない扱いになる() {
        let tmp = TempDir::new().unwrap();
        let copy_root = tmp.path().join("copies");
        let dir = tmp.path().join("ext");
        let entry = フォルダ拡張("e1", &パス文字列(&dir), true);
        assert_eq!(
            resolve_entry(&entry, None, &copy_root),
            ResolvedEntry::Missing
        );
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(
            resolve_entry(&entry, None, &copy_root),
            ResolvedEntry::Missing
        );
        fs::write(dir.join("manifest.json"), "{}").unwrap();
        assert_eq!(
            resolve_entry(&entry, None, &copy_root),
            ResolvedEntry::Path(パス文字列(&dir))
        );
    }

    #[test]
    fn chromeのルートが無いときは見つからない扱いになる() {
        let tmp = TempDir::new().unwrap();
        let entry = chrome拡張("e1", ID_A, true);
        assert_eq!(
            resolve_entry(&entry, None, tmp.path()),
            ResolvedEntry::Missing
        );
    }

    #[test]
    fn 予約名ファイルを含むフォルダはコピー先のパスに解決される() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("ext");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), "{}").unwrap();
        fs::write(dir.join("_bad.txt"), "x").unwrap();
        let copy_root = tmp.path().join("copies");
        let entry = フォルダ拡張("e1", &パス文字列(&dir), true);
        assert_eq!(
            resolve_entry(&entry, None, &copy_root),
            ResolvedEntry::Path(パス文字列(&copy_root.join("e1")))
        );
    }

    #[test]
    fn コピーに失敗したときはエラーになる() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("ext");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), "{}").unwrap();
        let entry = フォルダ拡張("../bad", &パス文字列(&dir), true);
        assert!(matches!(
            resolve_entry(&entry, None, tmp.path()),
            ResolvedEntry::Error(_)
        ));
    }

    #[test]
    fn 追加結果と削除結果がプロファイルに反映される() {
        let mut p = ProfileSync::default();
        apply_add_result(&mut p, "e1", "/p", "w1");
        apply_add_result(&mut p, "e2", "/q", "w2");
        assert_eq!(p.entries["e1"], 適用済み("/p", "w1"));
        apply_add_result(&mut p, "e1", "/p2", "w1b");
        assert_eq!(p.entries["e1"], 適用済み("/p2", "w1b"));
        apply_remove_result(&mut p, "w1b");
        assert!(!p.entries.contains_key("e1"));
        assert!(p.entries.contains_key("e2"));
    }

    #[test]
    fn プロファイルが無ければ作成し有ればそれを返す() {
        let mut state = ExtensionsState::default();
        apply_add_result(profile_for_mut(&mut state, "d1"), "e1", "/p", "w1");
        profile_for_mut(&mut state, "d2");
        assert_eq!(state.profiles.len(), 2);
        assert_eq!(profile_for_mut(&mut state, "d1").entries.len(), 1);
        assert_eq!(state.profiles.len(), 2);
    }

    #[test]
    fn 存在しないdata_directoryのプロファイルだけ除去される() {
        let mk = |d: &str| ProfileSync {
            data_directory: d.to_string(),
            ..Default::default()
        };
        let mut profiles = vec![mk("d1"), mk("d2"), mk("d3")];
        let live: HashSet<String> = ["d1", "d3"].iter().map(|s| s.to_string()).collect();
        prune_profiles(&mut profiles, &live);
        let names: Vec<_> = profiles.iter().map(|p| p.data_directory.as_str()).collect();
        assert_eq!(names, ["d1", "d3"]);
    }

    #[test]
    fn missingフラグは解決結果に合わせて更新され変化がなければfalse() {
        let mut entries = vec![
            フォルダ拡張("e1", "/p", true),
            フォルダ拡張("e2", "/q", true),
            フォルダ拡張("e3", "/r", true),
        ];
        entries[1].missing = true;
        entries[2].missing = true;
        let resolved = 解決(&[
            ("e1", ResolvedEntry::Missing),
            ("e2", ResolvedEntry::Path("/q".into())),
            ("e3", ResolvedEntry::Error("x".into())),
        ]);
        assert!(refresh_missing(&mut entries, &resolved));
        assert!(entries[0].missing);
        assert!(!entries[1].missing);
        assert!(entries[2].missing, "Error は前回の状態を維持する");
        assert!(!refresh_missing(&mut entries, &resolved));
    }

    #[test]
    fn chrome由来のメタデータがmanifestに合わせて更新される() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(
            dir.join("manifest.json"),
            r#"{"name":"New","action":{"default_popup":"p.html"},"options_page":"o.html"}"#,
        )
        .unwrap();
        let mut entry = chrome拡張("e1", ID_A, true);
        entry.name = "Old".into();
        assert!(refresh_metadata(&mut entry, dir, "ja"));
        assert_eq!(entry.name, "New");
        assert!(entry.has_popup && entry.has_options);
        assert!(!refresh_metadata(&mut entry, dir, "ja"));
    }

    #[test]
    fn manifestが読めないときやフォルダ指定のときはメタデータを更新しない() {
        let tmp = TempDir::new().unwrap();
        let mut entry = chrome拡張("e1", ID_A, true);
        entry.name = "Old".into();
        assert!(!refresh_metadata(&mut entry, tmp.path(), "ja"));
        assert_eq!(entry.name, "Old");

        fs::write(tmp.path().join("manifest.json"), r#"{"name":"New"}"#).unwrap();
        let mut folder = フォルダ拡張("e2", "/p", true);
        folder.name = "Old".into();
        assert!(!refresh_metadata(&mut folder, tmp.path(), "ja"));
        assert_eq!(folder.name, "Old");
    }
}

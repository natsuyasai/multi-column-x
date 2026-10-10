//! 拡張機能の管理コマンドが使うサービス層。
//!
//! - 状態操作（追加・有効無効・削除）と `open_extension_page` の検証は純粋関数に切り出し、OS 非依存でテストする。
//! - reconcile（desired state を各プロファイルの WebView2 へ反映）は `ProfileOps` 越しの
//!   `reconcile_profile` に集約し、WebView2 実呼び出しは Windows 版 `reconcile_webview` のみが行う。
//! - 状態の読み書きと reconcile は 1 つの `tokio::sync::Mutex` で直列化する
//!   （reconcile が読み込んだ古い状態で保存し、直前の追加・削除を失う競合を防ぐ）。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, MutexGuard};

use super::chrome::{chrome_extensions_root_from_env, DetectedExtension};
use super::executor::{apply_actions_with, ProfileOps};
use super::manifest::{read_manifest_info, ManifestInfo};
use super::model::{ExtensionEntry, ExtensionSource, ExtensionsState};
use super::reconcile_plan::{
    apply_add_result, apply_remove_result, plan_profile, profile_for_mut, prune_profiles,
    refresh_metadata, refresh_missing, resolve_entry, ResolvedEntry,
};
use super::sanitize::remove_sanitized_copy;
use super::store;

/// 非対応環境（Windows 以外）で返すエラー文言。
pub const UNSUPPORTED_MESSAGE: &str = "この環境では拡張機能に対応していません";
/// 表示名などの解決に使うロケール（現状は日本語固定）。
pub const LOCALE: &str = "ja";
/// 同じ拡張機能を二重に追加しようとしたときのエラー文言。
pub const ALREADY_ADDED_MESSAGE: &str = "すでに追加されています";

// ---------------------------------------------------------------------------
// 直列化ロック
// ---------------------------------------------------------------------------

static STATE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// 拡張機能の状態の読み書き・reconcile を直列化するロックを取る。
/// ロック保持中はブロッキング処理で長時間止めないこと。
pub async fn lock_state() -> MutexGuard<'static, ()> {
    STATE_LOCK.get_or_init(|| Mutex::new(())).lock().await
}

/// ロックを取って状態を読み込み、`f` で変更し、`f` が成功したときだけ保存する。
pub async fn modify_state<T>(
    app: &AppHandle,
    f: impl FnOnce(&mut ExtensionsState) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = lock_state().await;
    let mut state = store::load(app)?;
    let value = f(&mut state)?;
    store::save(app, &state)?;
    Ok(value)
}

// ---------------------------------------------------------------------------
// 状態操作（純粋関数）
// ---------------------------------------------------------------------------

/// 2 つのフォルダパスを同一視してよいか（区切り文字・末尾区切り・大文字小文字の違いを無視）。
/// Windows のパスは大文字小文字を区別しないため、OS に依らず常に同じ基準で比べる。
pub fn is_same_folder_path(a: &str, b: &str) -> bool {
    fn normalize(path: &str) -> String {
        strip_verbatim_prefix(path)
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    }
    normalize(a) == normalize(b)
}

/// フォルダ指定の拡張機能を追加する。同じパスが既にあればエラー。
pub fn add_folder_entry(
    state: &mut ExtensionsState,
    info: ManifestInfo,
    path: String,
    new_id: String,
) -> Result<ExtensionEntry, String> {
    let already = state.entries.iter().any(|e| {
        matches!(&e.source, ExtensionSource::Folder { path: existing } if is_same_folder_path(existing, &path))
    });
    if already {
        return Err(ALREADY_ADDED_MESSAGE.to_string());
    }
    let entry = ExtensionEntry {
        id: new_id,
        name: info.name,
        source: ExtensionSource::Folder { path },
        enabled: true,
        has_popup: info.has_popup,
        has_options: info.has_options,
        missing: false,
    };
    state.entries.push(entry.clone());
    Ok(entry)
}

/// Chrome から検出した拡張機能を追加する。同じ chromeId が既にあればエラー。
pub fn add_chrome_entry(
    state: &mut ExtensionsState,
    detected: &DetectedExtension,
    new_id: String,
) -> Result<ExtensionEntry, String> {
    let already = state.entries.iter().any(|e| {
        matches!(&e.source, ExtensionSource::Chrome { chrome_id, .. } if *chrome_id == detected.chrome_id)
    });
    if already {
        return Err(ALREADY_ADDED_MESSAGE.to_string());
    }
    let entry = ExtensionEntry {
        id: new_id,
        name: detected.name.clone(),
        source: ExtensionSource::Chrome {
            chrome_id: detected.chrome_id.clone(),
            profile: detected.profile.clone(),
        },
        enabled: true,
        has_popup: detected.has_popup,
        has_options: detected.has_options,
        missing: false,
    };
    state.entries.push(entry.clone());
    Ok(entry)
}

fn not_found_error() -> String {
    "拡張機能が見つかりません".to_string()
}

/// 有効・無効を切り替える。
pub fn set_enabled_in_state(
    state: &mut ExtensionsState,
    id: &str,
    enabled: bool,
) -> Result<(), String> {
    let entry = state
        .entries
        .iter_mut()
        .find(|e| e.id == id)
        .ok_or_else(not_found_error)?;
    entry.enabled = enabled;
    Ok(())
}

/// エントリを削除して返す。各プロファイルの適用記録は残す（reconcile が削除計画を立てるため）。
pub fn remove_entry_from_state(
    state: &mut ExtensionsState,
    id: &str,
) -> Result<ExtensionEntry, String> {
    let index = state
        .entries
        .iter()
        .position(|e| e.id == id)
        .ok_or_else(not_found_error)?;
    Ok(state.entries.remove(index))
}

// ---------------------------------------------------------------------------
// フォルダ指定の検証・削除後始末
// ---------------------------------------------------------------------------

/// Windows の `canonicalize` が付ける `\\?\` 接頭辞を除去する。
pub fn strip_verbatim_prefix(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = path.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    path.to_string()
}

/// ネットワークフォルダ（UNC）は不可。`\\?\UNC\` 形式も `\\server\share` と同じく拒否する。
/// 共有の切断や遅延で WebView2 の読み込みが不安定になるため。
pub fn ensure_local_folder_path(path: &str) -> Result<(), String> {
    let normalized = strip_verbatim_prefix(path);
    if normalized.starts_with(r"\\") || normalized.starts_with("//") {
        return Err(
            "ネットワークフォルダは追加できません。ローカルフォルダを指定してください".to_string(),
        );
    }
    Ok(())
}

/// 指定フォルダを実パス化し、manifest を検証する。manifest が無い／壊れている場合はエラー。
pub fn prepare_folder_for_add(path: &str) -> Result<(String, ManifestInfo), String> {
    // 共有への接続待ちを避けるため、実パス化の前にも判定する。
    ensure_local_folder_path(path)?;
    let canonical = std::fs::canonicalize(path)
        .map_err(|_| "指定されたフォルダが見つかりません".to_string())?;
    if !canonical.is_dir() {
        return Err("フォルダを指定してください".to_string());
    }
    let stored = strip_verbatim_prefix(&canonical.to_string_lossy());
    // シンボリックリンク等で UNC に解決されるケースも拒否する。
    ensure_local_folder_path(&stored)?;
    let info = read_manifest_info(&canonical, LOCALE).map_err(|e| e.to_string())?;
    Ok((stored, info))
}

/// 削除後の後始末。サニタイズコピーだけを削除し、元フォルダには触れない。
pub fn cleanup_after_remove(copy_root: &Path, entry: &ExtensionEntry) -> std::io::Result<()> {
    remove_sanitized_copy(copy_root, &entry.id)
}

// ---------------------------------------------------------------------------
// フォルダ解決・メタデータ更新
// ---------------------------------------------------------------------------

/// サニタイズコピーの置き場（`app_data_dir/extensions`）。無ければ作る。
pub fn copy_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("extensions");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

/// 全エントリの読み込み元を解決する（ファイル I/O を伴うため `spawn_blocking` 越しに呼ぶ）。
pub async fn resolve_all(
    app: &AppHandle,
    entries: &[ExtensionEntry],
) -> Result<HashMap<String, ResolvedEntry>, String> {
    let copy_root = copy_root(app)?;
    let chrome_root = chrome_extensions_root_from_env();
    let entries = entries.to_vec();
    tokio::task::spawn_blocking(move || {
        entries
            .iter()
            .map(|e| {
                (
                    e.id.clone(),
                    resolve_entry(e, chrome_root.as_deref(), &copy_root),
                )
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// 解決結果に合わせて `missing` と表示用メタデータを更新する。変化があれば true。
pub fn refresh_entries(
    entries: &mut [ExtensionEntry],
    resolved: &HashMap<String, ResolvedEntry>,
) -> bool {
    let mut changed = refresh_missing(entries, resolved);
    for entry in entries.iter_mut() {
        if let Some(ResolvedEntry::Path(path)) = resolved.get(&entry.id) {
            changed |= refresh_metadata(entry, Path::new(path), LOCALE);
        }
    }
    changed
}

/// ロック済みの状態で保存済みエントリを最新化して返す（`list_extensions` 本体）。
pub async fn list_refreshed(app: &AppHandle) -> Result<Vec<ExtensionEntry>, String> {
    let _guard = lock_state().await;
    let mut state = store::load(app)?;
    let resolved = resolve_all(app, &state.entries).await?;
    if refresh_entries(&mut state.entries, &resolved) {
        store::save(app, &state)?;
    }
    Ok(state.entries)
}

// ---------------------------------------------------------------------------
// reconcile
// ---------------------------------------------------------------------------

/// 全アカウントの data_directory が取れたときだけ、存在しないアカウントの `ProfileSync` を掃除する。
/// `None`（アカウント一覧が取れない）のときは何も消さない。
#[cfg_attr(not(windows), allow(dead_code))]
pub fn prune_state_profiles(state: &mut ExtensionsState, account_dirs: Option<&HashSet<String>>) {
    if let Some(dirs) = account_dirs {
        prune_profiles(&mut state.profiles, dirs);
    }
}

/// 稼働中プロファイルのうち、アカウントの data_directory だけに絞る
/// （external カラムなどアカウント非依存の保存先には拡張機能を同期しない）。
/// アカウント一覧が取れないときは絞り込まない。
#[cfg_attr(not(windows), allow(dead_code))]
pub fn retain_account_targets(
    targets: Vec<(String, String)>,
    account_dirs: Option<&HashSet<String>>,
) -> Vec<(String, String)> {
    match account_dirs {
        Some(dirs) => targets
            .into_iter()
            .filter(|(dir, _)| dirs.contains(dir))
            .collect(),
        None => targets,
    }
}

/// 1 プロファイル分の reconcile。状態の `ProfileSync` を更新し、WebView2 側が変化したかを返す。
/// 一部の操作だけ失敗した場合はログに残して `Ok(changed)` を返し、
/// 何も変化せずエラーだけだった場合は `Err`（連結したメッセージ）を返す。
#[cfg_attr(not(windows), allow(dead_code))]
pub async fn reconcile_profile<O: ProfileOps>(
    ops: &O,
    state: &mut ExtensionsState,
    resolved: &HashMap<String, ResolvedEntry>,
    data_directory: &str,
) -> Result<bool, String> {
    let installed = ops.list().await?;
    let applied = profile_for_mut(state, data_directory).entries.clone();
    let actions = plan_profile(&state.entries, resolved, &applied, &installed);
    if actions.is_empty() {
        return Ok(false);
    }

    let outcome = apply_actions_with(ops, &actions).await;
    let profile = profile_for_mut(state, data_directory);
    for (entry_id, path, new_id) in &outcome.added {
        apply_add_result(profile, entry_id, path, new_id);
    }
    for removed in &outcome.removed {
        apply_remove_result(profile, removed);
    }
    for error in &outcome.errors {
        log::warn!("[extensions] reconcile でエラー: {error}");
    }
    if !outcome.changed && !outcome.errors.is_empty() {
        return Err(outcome.errors.join(" / "));
    }
    Ok(outcome.changed)
}

/// 指定 WebView のプロファイル（data_directory）を desired state に合わせる。
/// WebView2 側に Add / Remove があった場合に true を返す。
#[cfg(windows)]
pub async fn reconcile_webview(
    app: &AppHandle,
    webview: &tauri::Webview,
    data_directory: &str,
) -> Result<bool, String> {
    use super::webview2::WebviewOps;

    let _guard = lock_state().await;
    let original = store::load(app)?;
    let mut state = original.clone();
    let resolved = resolve_all(app, &state.entries).await?;
    refresh_entries(&mut state.entries, &resolved);

    let result =
        reconcile_profile(&WebviewOps(webview), &mut state, &resolved, data_directory).await;
    // 削除済みアカウントの適用記録を掃除する（アカウント一覧が取れなければ掃除しない）。
    let account_dirs = crate::commands::settings_store::load_account_data_directories(app);
    prune_state_profiles(&mut state, account_dirs.as_ref());
    // 途中で失敗しても、適用できた分の記録は残す。
    if state != original {
        store::save(app, &state)?;
    }
    result
}

#[cfg(not(windows))]
pub async fn reconcile_webview(
    _app: &AppHandle,
    _webview: &tauri::Webview,
    _data_directory: &str,
) -> Result<bool, String> {
    Ok(false)
}

/// 稼働中の全プロファイルを reconcile する。WebView が見つからないものはスキップする。
/// 個別プロファイルの失敗はログに残して続行する（次回の reconcile で再試行される）。
#[cfg(windows)]
pub async fn reconcile_all_live(app: &AppHandle) -> Result<bool, String> {
    let account_dirs = crate::commands::settings_store::load_account_data_directories(app);
    let targets = retain_account_targets(live_profile_targets(app), account_dirs.as_ref());
    let mut changed = false;
    for (data_directory, label) in targets {
        let Some(webview) = app.get_webview(&label) else {
            continue;
        };
        match reconcile_webview(app, &webview, &data_directory).await {
            Ok(c) => changed |= c,
            Err(e) => log::warn!("[extensions] プロファイルの同期に失敗: label={label} err={e}"),
        }
    }
    Ok(changed)
}

#[cfg(not(windows))]
pub async fn reconcile_all_live(_app: &AppHandle) -> Result<bool, String> {
    Ok(false)
}

/// 稼働中プロファイルの (data_directory, 代表 label) 一覧。
pub fn live_profile_targets(app: &AppHandle) -> Vec<(String, String)> {
    let state = app.state::<crate::state::AppState>();
    let registry = state.registry.lock().expect("registry mutex poisoned");
    registry.distinct_data_directories()
}

// ---------------------------------------------------------------------------
// open_extension_page の検証・URL 組み立て（純粋関数）
// ---------------------------------------------------------------------------

/// 開くページの種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKind {
    Popup,
    Options,
}

impl PageKind {
    pub fn parse(kind: &str) -> Result<Self, String> {
        match kind {
            "popup" => Ok(PageKind::Popup),
            "options" => Ok(PageKind::Options),
            _ => Err("開くページの種類が不正です".to_string()),
        }
    }
}

/// 検証を通った、開くページの対象。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageTarget {
    pub kind: PageKind,
    /// ページを開くアカウント（そのアカウントのデータで開く）。
    pub account_id: String,
}

/// `open_extension_page` の入力を検証する。
pub fn validate_open_page(
    entry: Option<&ExtensionEntry>,
    kind: &str,
    account_id: Option<&str>,
) -> Result<PageTarget, String> {
    let entry = entry.ok_or_else(not_found_error)?;
    if !entry.enabled || entry.missing {
        return Err("無効な拡張機能は開けません".to_string());
    }
    let kind = PageKind::parse(kind)?;
    match kind {
        PageKind::Popup if !entry.has_popup => {
            return Err("この拡張機能にはポップアップがありません".to_string());
        }
        PageKind::Options if !entry.has_options => {
            return Err("この拡張機能にはオプションページがありません".to_string());
        }
        _ => {}
    }
    let account_id = account_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "アカウントを選択してください".to_string())?;
    Ok(PageTarget {
        kind,
        account_id: account_id.to_string(),
    })
}

/// `chrome-extension://<WebView2 の拡張 ID>/<相対パス>` を組み立てる。
/// 相対パスは manifest 側で検証済みだが、ここでも `..`・スキーム・絶対パス・`\` を拒否する。
pub fn build_extension_url(
    webview_extension_id: &str,
    relative_path: &str,
) -> Result<String, String> {
    let id_ok = !webview_extension_id.is_empty()
        && webview_extension_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric());
    if !id_ok {
        return Err("拡張機能の ID が不正です".to_string());
    }
    if !is_safe_relative_path(relative_path) {
        return Err("拡張機能のページのパスが不正です".to_string());
    }
    Ok(format!(
        "chrome-extension://{webview_extension_id}/{relative_path}"
    ))
}

/// URL に組み込んでよい相対パスか（親ディレクトリ参照・スキーム・絶対パス・`\` を含まない）。
fn is_safe_relative_path(path: &str) -> bool {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.contains("://") {
        return false;
    }
    !path.split('/').any(|segment| {
        matches!(
            segment.to_ascii_lowercase().as_str(),
            ".." | "%2e%2e" | ".%2e" | "%2e."
        )
    })
}

/// `data_directory` のプロファイルで、アプリ側エントリ `entry_id` に対応する WebView2 の拡張 ID。
pub fn applied_webview_id(
    state: &ExtensionsState,
    data_directory: &str,
    entry_id: &str,
) -> Option<String> {
    state
        .profiles
        .iter()
        .find(|p| p.data_directory == data_directory)
        .and_then(|p| p.entries.get(entry_id))
        .map(|a| a.webview_id.clone())
        .filter(|id| !id.is_empty())
}

/// 稼働中プロファイル一覧から、`data_directory` の代表 label を探す。
pub fn find_representative_label<'a>(
    targets: &'a [(String, String)],
    data_directory: &str,
) -> Option<&'a str> {
    targets
        .iter()
        .find(|(dir, _)| dir == data_directory)
        .map(|(_, label)| label.as_str())
}

/// 追加済みの Chrome 拡張機能 ID の集合。
pub fn added_chrome_ids(state: &ExtensionsState) -> HashSet<String> {
    state
        .entries
        .iter()
        .filter_map(|e| match &e.source {
            ExtensionSource::Chrome { chrome_id, .. } => Some(chrome_id.clone()),
            ExtensionSource::Folder { .. } => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::fs;

    use tempfile::TempDir;

    use super::super::model::{AppliedExtension, ProfileSync};
    use super::super::reconcile_plan::InstalledExt;
    use super::*;

    const CHROME_ID: &str = "abcdefghijklmnopabcdefghijklmnop";

    fn 情報(name: &str) -> ManifestInfo {
        ManifestInfo {
            name: name.to_string(),
            has_popup: true,
            has_options: false,
            popup_path: Some("popup.html".to_string()),
            options_path: None,
        }
    }

    fn 検出結果() -> DetectedExtension {
        DetectedExtension {
            chrome_id: CHROME_ID.to_string(),
            profile: "Default".to_string(),
            name: "Chrome拡張".to_string(),
            path: "C:\\chrome\\ext\\1.0_0".to_string(),
            has_popup: false,
            has_options: true,
            added: false,
        }
    }

    fn エントリ(id: &str, enabled: bool, popup: bool, options: bool) -> ExtensionEntry {
        ExtensionEntry {
            id: id.to_string(),
            name: id.to_string(),
            source: ExtensionSource::Folder {
                path: format!("C:\\ext\\{id}"),
            },
            enabled,
            has_popup: popup,
            has_options: options,
            missing: false,
        }
    }

    // ---- 追加 ----

    #[test]
    fn アカウント一覧が取れないときはプロファイルを掃除しない() {
        let profile = |d: &str| ProfileSync {
            data_directory: d.to_string(),
            ..Default::default()
        };
        let mut state = ExtensionsState {
            profiles: vec![profile("/d/a"), profile("/d/gone")],
            ..Default::default()
        };
        prune_state_profiles(&mut state, None);
        assert_eq!(state.profiles.len(), 2);

        let dirs: HashSet<String> = ["/d/a".to_string()].into();
        prune_state_profiles(&mut state, Some(&dirs));
        assert_eq!(state.profiles, vec![profile("/d/a")]);
    }

    #[test]
    fn 同期対象はアカウントのdatadirectoryだけに絞られる() {
        let targets = vec![
            ("/d/a".to_string(), "column-1".to_string()),
            ("/d/external".to_string(), "column-2".to_string()),
        ];
        let dirs: HashSet<String> = ["/d/a".to_string()].into();
        assert_eq!(
            retain_account_targets(targets.clone(), Some(&dirs)),
            vec![("/d/a".to_string(), "column-1".to_string())]
        );
        assert_eq!(retain_account_targets(targets.clone(), None), targets);
    }

    #[test]
    fn 大文字小文字や区切り文字が違うだけのフォルダパスは同一視される() {
        assert!(is_same_folder_path(r"C:\Ext\A", r"c:\ext\a"));
        assert!(is_same_folder_path(r"C:\ext\a\", r"C:\ext\a"));
        assert!(is_same_folder_path("C:/ext/a", r"C:\ext\a"));
        assert!(is_same_folder_path(r"\\?\C:\ext\a", r"C:\ext\a"));
        assert!(!is_same_folder_path(r"C:\ext\a", r"C:\ext\b"));
        assert!(!is_same_folder_path(r"C:\ext\a", r"C:\ext\a2"));
    }

    #[test]
    fn 同じフォルダを二重に追加するとすでに追加されていますエラーになる() {
        let mut state = ExtensionsState::default();
        add_folder_entry(
            &mut state,
            情報("拡張"),
            r"C:\Ext\A".to_string(),
            "id-1".to_string(),
        )
        .unwrap();
        let err = add_folder_entry(
            &mut state,
            情報("拡張"),
            r"c:\ext\a".to_string(),
            "id-2".to_string(),
        )
        .unwrap_err();
        assert_eq!(err, ALREADY_ADDED_MESSAGE);
        assert_eq!(state.entries.len(), 1);
    }

    #[test]
    fn 展開済みの拡張機能フォルダを指定すると全アカウントに追加される() {
        // 状態に有効なエントリとして追加される
        let mut state = ExtensionsState::default();
        let added = add_folder_entry(
            &mut state,
            情報("便利拡張"),
            "C:\\ext\\a".to_string(),
            "id-1".to_string(),
        )
        .unwrap();
        assert_eq!(state.entries, vec![added.clone()]);
        assert!(added.enabled);
        assert_eq!(added.name, "便利拡張");
        assert_eq!(
            added.source,
            ExtensionSource::Folder {
                path: "C:\\ext\\a".to_string()
            }
        );

        // 稼働中の全アカウント（プロファイル）に Add として反映される
        let resolved: HashMap<String, ResolvedEntry> = [(
            "id-1".to_string(),
            ResolvedEntry::Path("C:\\ext\\a".to_string()),
        )]
        .into();
        for (dir, new_id) in [("C:\\data\\acc1", "wv-1"), ("C:\\data\\acc2", "wv-2")] {
            let mut state = state.clone();
            let mock = Mock::new(vec![], [("C:\\ext\\a", new_id)]);
            let changed = block_on(reconcile_profile(&mock, &mut state, &resolved, dir)).unwrap();
            assert!(changed);
            assert_eq!(
                applied_webview_id(&state, dir, "id-1"),
                Some(new_id.to_string())
            );
        }
    }

    #[test]
    fn ローカルパスはネットワークフォルダ判定を通る() {
        for ok in [
            r"C:\ext",
            r"C:\",
            r"\\?\C:\ext",
            "/home/u/ext",
            r"D:\a b\ext",
        ] {
            assert!(ensure_local_folder_path(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn uncパスはネットワークフォルダとして拒否される() {
        for ng in [
            r"\\server\share\ext",
            r"\\?\UNC\server\share\ext",
            "//server/share/ext",
        ] {
            let err = ensure_local_folder_path(ng).unwrap_err();
            assert_eq!(
                err, "ネットワークフォルダは追加できません。ローカルフォルダを指定してください",
                "{ng}"
            );
        }
    }

    #[test]
    fn ネットワークフォルダを指定するとフォルダ検証の前に拒否される() {
        let err = prepare_folder_for_add(r"\\server\share\ext").unwrap_err();
        assert!(
            err.contains("ネットワークフォルダは追加できません"),
            "{err}"
        );
    }

    #[test]
    fn manifestが無いフォルダを指定すると追加されずエラーが表示される() {
        let tmp = TempDir::new().unwrap();
        let empty = tmp.path().join("empty");
        fs::create_dir_all(&empty).unwrap();

        let err = prepare_folder_for_add(empty.to_str().unwrap()).unwrap_err();
        assert!(err.contains("manifest.json"), "{err}");

        // 壊れた manifest も追加できない
        let broken = tmp.path().join("broken");
        fs::create_dir_all(&broken).unwrap();
        fs::write(broken.join("manifest.json"), "{ 壊れ").unwrap();
        assert!(prepare_folder_for_add(broken.to_str().unwrap()).is_err());

        // 存在しないパス
        assert!(prepare_folder_for_add(tmp.path().join("none").to_str().unwrap()).is_err());
    }

    #[test]
    fn manifestがあるフォルダは実パスと情報が返る() {
        let tmp = TempDir::new().unwrap();
        fs::write(
            tmp.path().join("manifest.json"),
            r#"{"name":"テスト拡張","action":{"default_popup":"p.html"}}"#,
        )
        .unwrap();
        let (path, info) = prepare_folder_for_add(tmp.path().to_str().unwrap()).unwrap();
        assert!(!path.starts_with(r"\\?\"), "{path}");
        assert!(Path::new(&path).is_dir());
        assert_eq!(info.name, "テスト拡張");
        assert!(info.has_popup);
    }

    #[test]
    fn フォルダ指定で追加した拡張機能を削除しても元のフォルダは残る() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("src_ext");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("manifest.json"), "{}").unwrap();
        fs::write(source.join("_bad.txt"), "x").unwrap();
        let copy_root = tmp.path().join("extensions");
        fs::create_dir_all(&copy_root).unwrap();

        let mut state = ExtensionsState::default();
        let entry = add_folder_entry(
            &mut state,
            情報("x"),
            source.to_string_lossy().into_owned(),
            "entry-1".to_string(),
        )
        .unwrap();
        // 予約名ファイルがあるのでサニタイズコピーが作られる
        let prepared =
            super::super::sanitize::prepare_extension_dir(&source, &copy_root, &entry.id).unwrap();
        assert!(prepared.copied && prepared.path.exists());

        let removed = remove_entry_from_state(&mut state, &entry.id).unwrap();
        cleanup_after_remove(&copy_root, &removed).unwrap();

        assert!(!prepared.path.exists(), "コピーは削除される");
        assert!(source.join("manifest.json").is_file(), "元フォルダは残る");
        assert!(source.join("_bad.txt").is_file());
    }

    #[test]
    fn 候補から選んだ拡張機能が全アカウントに追加される() {
        let mut state = ExtensionsState::default();
        let added = add_chrome_entry(&mut state, &検出結果(), "id-c".to_string()).unwrap();
        assert_eq!(
            added.source,
            ExtensionSource::Chrome {
                chrome_id: CHROME_ID.to_string(),
                profile: "Default".to_string()
            }
        );
        assert!(added.enabled && !added.has_popup && added.has_options);
        assert_eq!(state.entries.len(), 1);

        let resolved: HashMap<String, ResolvedEntry> = [(
            "id-c".to_string(),
            ResolvedEntry::Path("C:\\chrome\\ext\\1.0_0".to_string()),
        )]
        .into();
        for (dir, new_id) in [("C:\\data\\acc1", "wv-1"), ("C:\\data\\acc2", "wv-2")] {
            let mut state = state.clone();
            let mock = Mock::new(vec![], [("C:\\chrome\\ext\\1.0_0", new_id)]);
            assert!(block_on(reconcile_profile(&mock, &mut state, &resolved, dir)).unwrap());
            assert_eq!(
                applied_webview_id(&state, dir, "id-c"),
                Some(new_id.to_string())
            );
        }
    }

    #[test]
    fn 同じchromeidを二重に追加するとエラーになる() {
        let mut state = ExtensionsState::default();
        add_chrome_entry(&mut state, &検出結果(), "id-1".to_string()).unwrap();
        let err = add_chrome_entry(&mut state, &検出結果(), "id-2".to_string()).unwrap_err();
        assert_eq!(err, "すでに追加されています");
        assert_eq!(state.entries.len(), 1);
    }

    // ---- 有効・無効 ----

    #[test]
    fn 拡張機能を無効にすると全アカウントで無効になる() {
        let mut state = ExtensionsState {
            entries: vec![エントリ("e1", true, false, false)],
            ..Default::default()
        };
        set_enabled_in_state(&mut state, "e1", false).unwrap();
        assert!(!state.entries[0].enabled);

        // 各アカウントのプロファイルで SetEnabled(false) が実行される
        let resolved: HashMap<String, ResolvedEntry> = [(
            "e1".to_string(),
            ResolvedEntry::Path("C:\\ext\\e1".to_string()),
        )]
        .into();
        for (dir, wv) in [("C:\\data\\acc1", "wv-1"), ("C:\\data\\acc2", "wv-2")] {
            let mut state = state.clone();
            profile_for_mut(&mut state, dir).entries.insert(
                "e1".to_string(),
                AppliedExtension {
                    applied_path: "C:\\ext\\e1".to_string(),
                    webview_id: wv.to_string(),
                },
            );
            let mock = Mock::new(
                vec![InstalledExt {
                    id: wv.to_string(),
                    enabled: true,
                }],
                [],
            );
            block_on(reconcile_profile(&mock, &mut state, &resolved, dir)).unwrap();
            assert_eq!(mock.calls(), vec![format!("set_enabled:{wv}:false")]);
        }
    }

    #[test]
    fn 無効にした拡張機能を有効に戻せる() {
        let mut state = ExtensionsState {
            entries: vec![エントリ("e1", false, false, false)],
            ..Default::default()
        };
        set_enabled_in_state(&mut state, "e1", true).unwrap();
        assert!(state.entries[0].enabled);

        let resolved: HashMap<String, ResolvedEntry> = [(
            "e1".to_string(),
            ResolvedEntry::Path("C:\\ext\\e1".to_string()),
        )]
        .into();
        profile_for_mut(&mut state, "C:\\data\\acc1")
            .entries
            .insert(
                "e1".to_string(),
                AppliedExtension {
                    applied_path: "C:\\ext\\e1".to_string(),
                    webview_id: "wv-1".to_string(),
                },
            );
        let mock = Mock::new(
            vec![InstalledExt {
                id: "wv-1".to_string(),
                enabled: false,
            }],
            [],
        );
        block_on(reconcile_profile(
            &mock,
            &mut state,
            &resolved,
            "C:\\data\\acc1",
        ))
        .unwrap();
        assert_eq!(mock.calls(), vec!["set_enabled:wv-1:true".to_string()]);
    }

    #[test]
    fn 存在しないidの有効無効変更と削除はエラーになる() {
        let mut state = ExtensionsState::default();
        assert!(set_enabled_in_state(&mut state, "none", true).is_err());
        assert!(remove_entry_from_state(&mut state, "none").is_err());
    }

    // ---- 削除 ----

    #[test]
    fn 拡張機能を削除すると全アカウントから削除される() {
        let mut state = ExtensionsState {
            entries: vec![
                エントリ("e1", true, false, false),
                エントリ("e2", true, false, false),
            ],
            ..Default::default()
        };
        let removed = remove_entry_from_state(&mut state, "e1").unwrap();
        assert_eq!(removed.id, "e1");
        assert_eq!(
            state
                .entries
                .iter()
                .map(|e| e.id.as_str())
                .collect::<Vec<_>>(),
            vec!["e2"]
        );

        let resolved: HashMap<String, ResolvedEntry> = [(
            "e2".to_string(),
            ResolvedEntry::Path("C:\\ext\\e2".to_string()),
        )]
        .into();
        for (dir, wv1, wv2) in [
            ("C:\\data\\acc1", "a1", "a2"),
            ("C:\\data\\acc2", "b1", "b2"),
        ] {
            let mut state = state.clone();
            let p = profile_for_mut(&mut state, dir);
            for (id, wv) in [("e1", wv1), ("e2", wv2)] {
                p.entries.insert(
                    id.to_string(),
                    AppliedExtension {
                        applied_path: format!("C:\\ext\\{id}"),
                        webview_id: wv.to_string(),
                    },
                );
            }
            let mock = Mock::new(
                vec![
                    InstalledExt {
                        id: wv1.to_string(),
                        enabled: true,
                    },
                    InstalledExt {
                        id: wv2.to_string(),
                        enabled: true,
                    },
                ],
                [],
            );
            assert!(block_on(reconcile_profile(&mock, &mut state, &resolved, dir)).unwrap());
            assert_eq!(mock.calls(), vec![format!("remove:{wv1}")]);
            assert_eq!(applied_webview_id(&state, dir, "e1"), None);
            assert_eq!(applied_webview_id(&state, dir, "e2"), Some(wv2.to_string()));
        }
    }

    // ---- 一覧 ----

    #[test]
    fn 既定で組み込まれている拡張機能は一覧に表示されない() {
        // WebView2 側に既定拡張（アプリが把握していない ID）があっても、
        // reconcile は状態のエントリ一覧を増やさず、既定拡張にも触れない。
        let mut state = ExtensionsState {
            entries: vec![エントリ("e1", true, false, false)],
            ..Default::default()
        };
        let resolved: HashMap<String, ResolvedEntry> = [(
            "e1".to_string(),
            ResolvedEntry::Path("C:\\ext\\e1".to_string()),
        )]
        .into();
        let mock = Mock::new(
            vec![InstalledExt {
                id: "builtin-default-ext".to_string(),
                enabled: true,
            }],
            [("C:\\ext\\e1", "wv-1")],
        );
        block_on(reconcile_profile(
            &mock,
            &mut state,
            &resolved,
            "C:\\data\\acc1",
        ))
        .unwrap();

        assert_eq!(state.entries.len(), 1);
        assert_eq!(state.entries[0].id, "e1");
        assert!(mock
            .calls()
            .iter()
            .all(|c| !c.contains("builtin-default-ext")));
    }

    // ---- open_extension_page の検証 ----

    #[test]
    fn 無効な拡張機能のポップアップとオプションは開けない() {
        let disabled = エントリ("e1", false, true, true);
        for kind in ["popup", "options"] {
            let err = validate_open_page(Some(&disabled), kind, Some("acc1")).unwrap_err();
            assert_eq!(err, "無効な拡張機能は開けません");
        }
        // 見つからない（missing）拡張機能も同様
        let mut missing = エントリ("e2", true, true, true);
        missing.missing = true;
        assert_eq!(
            validate_open_page(Some(&missing), "popup", Some("acc1")).unwrap_err(),
            "無効な拡張機能は開けません"
        );
        // エントリ自体が無い
        assert!(validate_open_page(None, "popup", Some("acc1")).is_err());
    }

    #[test]
    fn ポップアップを持たない拡張機能のポップアップは開けない() {
        let entry = エントリ("e1", true, false, true);
        assert!(validate_open_page(Some(&entry), "popup", Some("acc1")).is_err());
        assert!(validate_open_page(Some(&entry), "options", Some("acc1")).is_ok());
    }

    #[test]
    fn オプションを持たない拡張機能のオプションは開けない() {
        let entry = エントリ("e1", true, true, false);
        assert!(validate_open_page(Some(&entry), "options", Some("acc1")).is_err());
        assert!(validate_open_page(Some(&entry), "popup", Some("acc1")).is_ok());
    }

    #[test]
    fn ポップアップを開くときは現在選択中のアカウントのデータで開かれる() {
        let entry = エントリ("e1", true, true, true);
        let target = validate_open_page(Some(&entry), "popup", Some("acc-selected")).unwrap();
        assert_eq!(
            target,
            PageTarget {
                kind: PageKind::Popup,
                account_id: "acc-selected".to_string()
            }
        );

        // アカウント未指定・空はエラー
        for account in [None, Some(""), Some("  ")] {
            let err = validate_open_page(Some(&entry), "popup", account).unwrap_err();
            assert_eq!(err, "アカウントを選択してください");
        }
    }

    #[test]
    fn 種類が不正なページは開けない() {
        let entry = エントリ("e1", true, true, true);
        assert!(validate_open_page(Some(&entry), "background", Some("acc1")).is_err());
    }

    #[test]
    fn 適用済みのwebview_idをプロファイルごとに引ける() {
        let mut state = ExtensionsState::default();
        state.profiles.push(ProfileSync {
            data_directory: "C:\\data\\acc1".to_string(),
            entries: [(
                "e1".to_string(),
                AppliedExtension {
                    applied_path: "p".to_string(),
                    webview_id: "wv-1".to_string(),
                },
            )]
            .into(),
        });
        assert_eq!(
            applied_webview_id(&state, "C:\\data\\acc1", "e1"),
            Some("wv-1".to_string())
        );
        assert_eq!(applied_webview_id(&state, "C:\\data\\acc2", "e1"), None);
        assert_eq!(applied_webview_id(&state, "C:\\data\\acc1", "e2"), None);
    }

    #[test]
    fn 代表labelをdata_directoryで引ける() {
        let targets = vec![
            ("C:\\data\\acc1".to_string(), "column-a".to_string()),
            ("C:\\data\\acc2".to_string(), "column-b".to_string()),
        ];
        assert_eq!(
            find_representative_label(&targets, "C:\\data\\acc2"),
            Some("column-b")
        );
        assert_eq!(find_representative_label(&targets, "C:\\data\\none"), None);
    }

    #[test]
    fn verbatim接頭辞を除去する() {
        assert_eq!(strip_verbatim_prefix(r"\\?\C:\ext\a"), r"C:\ext\a");
        assert_eq!(
            strip_verbatim_prefix(r"\\?\UNC\srv\share\a"),
            r"\\srv\share\a"
        );
        assert_eq!(strip_verbatim_prefix(r"C:\ext\a"), r"C:\ext\a");
    }

    #[test]
    fn 追加済みのchromeidを集められる() {
        let mut state = ExtensionsState::default();
        add_chrome_entry(&mut state, &検出結果(), "id-c".to_string()).unwrap();
        add_folder_entry(
            &mut state,
            情報("f"),
            "C:\\f".to_string(),
            "id-f".to_string(),
        )
        .unwrap();
        assert_eq!(
            added_chrome_ids(&state),
            HashSet::from([CHROME_ID.to_string()])
        );
    }

    // ---- URL 組み立て ----

    #[test]
    fn 相対パスから拡張機能のurlを組み立てる() {
        assert_eq!(
            build_extension_url(CHROME_ID, "popup.html").unwrap(),
            format!("chrome-extension://{CHROME_ID}/popup.html")
        );
        assert_eq!(
            build_extension_url(CHROME_ID, "ui/options/index.html").unwrap(),
            format!("chrome-extension://{CHROME_ID}/ui/options/index.html")
        );
    }

    #[test]
    fn 危険な相対パスはurlに組み立てない() {
        for bad in [
            "../secret.html",
            "a/../../b.html",
            "..",
            "/abs.html",
            "https://evil.example/x.html",
            "javascript://x",
            "a\\b.html",
            "%2e%2e/b.html",
            "",
        ] {
            assert!(
                build_extension_url(CHROME_ID, bad).is_err(),
                "拒否されるべき: {bad}"
            );
        }
    }

    #[test]
    fn 不正な拡張idではurlを組み立てない() {
        for bad in ["", "a/b", "id with space", "a:b", "../x"] {
            assert!(
                build_extension_url(bad, "popup.html").is_err(),
                "拒否されるべき: {bad}"
            );
        }
    }

    #[test]
    fn ドットを含むだけのファイル名は許可される() {
        assert!(build_extension_url(CHROME_ID, "a..b.html").is_ok());
    }

    // ---- モック ----

    struct Mock {
        installed: Vec<InstalledExt>,
        add_ids: HashMap<String, String>,
        calls: RefCell<Vec<String>>,
    }

    impl Mock {
        fn new<const N: usize>(installed: Vec<InstalledExt>, adds: [(&str, &str); N]) -> Self {
            Self {
                installed,
                add_ids: adds
                    .iter()
                    .map(|(p, i)| (p.to_string(), i.to_string()))
                    .collect(),
                calls: RefCell::new(Vec::new()),
            }
        }
        fn calls(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }
    }

    impl ProfileOps for Mock {
        async fn list(&self) -> Result<Vec<InstalledExt>, String> {
            Ok(self.installed.clone())
        }
        async fn add(&self, path: &str) -> Result<InstalledExt, String> {
            self.calls.borrow_mut().push(format!("add:{path}"));
            self.add_ids
                .get(path)
                .map(|id| InstalledExt {
                    id: id.clone(),
                    enabled: true,
                })
                .ok_or_else(|| "add 失敗".to_string())
        }
        async fn remove(&self, webview_id: &str) -> Result<(), String> {
            self.calls.borrow_mut().push(format!("remove:{webview_id}"));
            Ok(())
        }
        async fn set_enabled(&self, webview_id: &str, enabled: bool) -> Result<(), String> {
            self.calls
                .borrow_mut()
                .push(format!("set_enabled:{webview_id}:{enabled}"));
            Ok(())
        }
    }

    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(f)
    }

    mod properties {
        use proptest::prelude::*;

        use super::super::{build_extension_url, is_same_folder_path};

        fn 拡張機能id() -> impl Strategy<Value = String> {
            "[a-z0-9]{1,32}"
        }

        fn 安全なセグメント() -> impl Strategy<Value = String> {
            "[a-zA-Z0-9_.-]{1,8}".prop_filter("親ディレクトリ参照は除く", |s| s != "..")
        }

        fn 安全な相対パス() -> impl Strategy<Value = String> {
            prop::collection::vec(安全なセグメント(), 1..4).prop_map(|v| v.join("/"))
        }

        fn 危険なトークン() -> impl Strategy<Value = &'static str> {
            prop_oneof![
                Just(".."),
                Just("%2e%2e"),
                Just("%2E%2E"),
                Just(".%2e"),
                Just("%2E."),
            ]
        }

        proptest! {
            #[test]
            fn 組み立てに成功したurlは拡張機能のオリジンで始まる(
                id in 拡張機能id(),
                path in any::<String>()
            ) {
                if let Ok(url) = build_extension_url(&id, &path) {
                    let prefix = format!("chrome-extension://{id}/");
                    prop_assert!(url.starts_with(&prefix), "{}", url);
                    let rest = &url[prefix.len()..];
                    prop_assert!(!rest.is_empty());
                    prop_assert!(!rest.starts_with('/'));
                    prop_assert!(!rest.contains('\\'));
                    prop_assert!(!rest.contains("://"));
                    prop_assert!(!rest.split('/').any(|s| s == ".."));
                }
            }

            #[test]
            fn 安全な相対パスは必ず組み立てられる(
                id in 拡張機能id(),
                path in 安全な相対パス()
            ) {
                let url = build_extension_url(&id, &path).unwrap();
                prop_assert_eq!(url, format!("chrome-extension://{id}/{path}"));
            }

            #[test]
            fn 親ディレクトリ参照のセグメントを含む入力は常に拒否される(
                id in 拡張機能id(),
                before in prop::collection::vec(安全なセグメント(), 0..3),
                token in 危険なトークン(),
                after in prop::collection::vec(安全なセグメント(), 0..3)
            ) {
                let mut segments = before;
                segments.push(token.to_string());
                segments.extend(after);
                prop_assert!(build_extension_url(&id, &segments.join("/")).is_err());
            }

            #[test]
            fn スキーム区切りを含む入力は常に拒否される(
                id in 拡張機能id(),
                head in "[a-zA-Z0-9_./-]{0,8}",
                tail in "[a-zA-Z0-9_./-]{0,8}"
            ) {
                let path = format!("{head}://{tail}");
                prop_assert!(build_extension_url(&id, &path).is_err());
            }

            #[test]
            fn バックスラッシュを含む入力は常に拒否される(
                id in 拡張機能id(),
                head in "[a-zA-Z0-9_./-]{0,8}",
                tail in "[a-zA-Z0-9_./-]{0,8}"
            ) {
                let path = format!("{head}\\{tail}");
                prop_assert!(build_extension_url(&id, &path).is_err());
            }

            #[test]
            fn フォルダパスの同一視は反射的で対称的である(
                a in any::<String>(),
                b in any::<String>()
            ) {
                prop_assert!(is_same_folder_path(&a, &a));
                prop_assert_eq!(is_same_folder_path(&a, &b), is_same_folder_path(&b, &a));
            }

            #[test]
            fn 大文字小文字と区切りと末尾区切りと接頭辞だけが違うパスは同一視される(
                drive in "[A-Za-z]",
                segments in prop::collection::vec("[a-zA-Z0-9_.-]{1,8}", 1..4),
                separator_a in prop::sample::select(vec!["\\", "/"]),
                separator_b in prop::sample::select(vec!["\\", "/"]),
                upper in any::<bool>(),
                trailing in prop::collection::vec(prop::sample::select(vec!["\\", "/"]), 0..3),
                verbatim in any::<bool>()
            ) {
                let base_a = format!("{drive}:{separator_a}{}", segments.join(separator_a));
                let mut base_b = format!("{drive}:{separator_b}{}", segments.join(separator_b));
                base_b = if upper { base_b.to_uppercase() } else { base_b.to_lowercase() };
                base_b.push_str(&trailing.concat());
                if verbatim {
                    base_b = format!(r"\\?\{base_b}");
                }
                prop_assert!(is_same_folder_path(&base_a, &base_b), "{} と {}", base_a, base_b);
            }

            #[test]
            fn 末尾以外の区切りが違うパスは同一視されない(
                segments in prop::collection::vec("[a-z0-9]{1,8}", 2..4),
                extra in "[a-z0-9]{1,8}"
            ) {
                let a = format!("C:\\{}", segments.join("\\"));
                let b = format!("{a}\\{extra}");
                prop_assert!(!is_same_folder_path(&a, &b));
            }
        }
    }
}

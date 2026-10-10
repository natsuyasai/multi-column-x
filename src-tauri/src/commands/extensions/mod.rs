//! ブラウザ拡張機能（Chrome 拡張）の管理コマンド。
//!
//! 全コマンドは main ウィンドウからの呼び出しに限る（`require_main_caller`）。
//! Windows 以外では全コマンドが「この環境では拡張機能に対応していません」を返す。
//! 実 WebView2 に触れる部分は薄く保ち、ロジックは `service` の純粋関数に分離している。

pub mod chrome;
pub mod executor;
pub mod hresult;
pub mod manifest;
pub mod model;
pub mod reconcile_plan;
pub mod sanitize;
pub mod service;
pub mod store;
#[cfg(windows)]
pub mod webview2;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use self::chrome::{chrome_extensions_root_from_env, detect_extensions, DetectedExtension};
use self::model::ExtensionEntry;
use self::reconcile_plan::ResolvedEntry;
use self::service::{
    add_chrome_entry, add_folder_entry, applied_webview_id, build_extension_url,
    cleanup_after_remove, find_representative_label, live_profile_targets, modify_state,
    prepare_folder_for_add, reconcile_all_live, reconcile_webview, remove_entry_from_state,
    set_enabled_in_state, validate_open_page, PageKind, LOCALE, UNSUPPORTED_MESSAGE,
};
use crate::commands::require_main_caller;
use crate::commands::settings_store::resolve_account_data_directory;

/// Windows 以外では拡張機能を扱えない。
fn ensure_supported() -> Result<(), String> {
    if cfg!(windows) {
        Ok(())
    } else {
        Err(UNSUPPORTED_MESSAGE.to_string())
    }
}

/// `detect_chrome_extensions` の戻り値。
#[derive(Debug, Clone, Serialize)]
pub struct DetectResult {
    #[serde(rename = "chromeFound")]
    pub chrome_found: bool,
    pub items: Vec<DetectedExtension>,
}

/// 保存済みの拡張機能の一覧（`missing` を最新化して返す）。
#[tauri::command]
pub async fn list_extensions(
    caller: tauri::Webview,
    app: AppHandle,
) -> Result<Vec<ExtensionEntry>, String> {
    require_main_caller(&caller)?;
    ensure_supported()?;
    service::list_refreshed(&app).await
}

/// Chrome（Default プロファイル）にインストール済みの拡張機能を検出する。
#[tauri::command]
pub async fn detect_chrome_extensions(
    caller: tauri::Webview,
    app: AppHandle,
) -> Result<DetectResult, String> {
    require_main_caller(&caller)?;
    ensure_supported()?;
    let state = store::load(&app)?;
    let added = service::added_chrome_ids(&state);
    let Some(root) = chrome_extensions_root_from_env() else {
        return Ok(DetectResult {
            chrome_found: false,
            items: Vec::new(),
        });
    };
    let outcome = tokio::task::spawn_blocking(move || detect_extensions(&root, LOCALE, &added))
        .await
        .map_err(|e| e.to_string())?;
    Ok(DetectResult {
        chrome_found: outcome.chrome_found,
        items: outcome.items,
    })
}

/// 拡張機能フォルダの選択ダイアログを開く。キャンセル時は None。
/// フロントに dialog 権限を与えないため、ダイアログは Rust 側で開く。
#[tauri::command]
pub async fn pick_extension_folder(
    caller: tauri::Webview,
    app: AppHandle,
) -> Result<Option<String>, String> {
    require_main_caller(&caller)?;
    ensure_supported()?;
    pick_folder(&app).await
}

#[cfg(windows)]
async fn pick_folder(app: &AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // ダイアログ待ちで tokio ワーカーを占有しないよう、コールバックを oneshot で受ける。
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let Some(path) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(not(windows))]
async fn pick_folder(_app: &AppHandle) -> Result<Option<String>, String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}

/// 展開済みの拡張機能フォルダを追加する。manifest が無い／壊れている場合は追加せずエラー。
#[tauri::command]
pub async fn add_extension_from_folder(
    caller: tauri::Webview,
    app: AppHandle,
    path: String,
) -> Result<ExtensionEntry, String> {
    require_main_caller(&caller)?;
    ensure_supported()?;
    let (stored_path, info) = tokio::task::spawn_blocking(move || prepare_folder_for_add(&path))
        .await
        .map_err(|e| e.to_string())??;
    let new_id = uuid::Uuid::new_v4().to_string();
    let entry = modify_state(&app, |state| {
        add_folder_entry(state, info, stored_path, new_id)
    })
    .await?;
    reconcile_all_live(&app).await?;
    Ok(entry)
}

/// Chrome で検出した拡張機能（最新バージョン）を追加する。
#[tauri::command]
pub async fn add_chrome_extension(
    caller: tauri::Webview,
    app: AppHandle,
    #[allow(non_snake_case)] chromeId: String,
) -> Result<ExtensionEntry, String> {
    require_main_caller(&caller)?;
    ensure_supported()?;
    let root = chrome_extensions_root_from_env().ok_or("Chrome が見つかりません")?;
    let detected = tokio::task::spawn_blocking(move || {
        detect_extensions(&root, LOCALE, &Default::default())
            .items
            .into_iter()
            .find(|d| d.chrome_id == chromeId)
    })
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Chrome に該当する拡張機能が見つかりません")?;
    let new_id = uuid::Uuid::new_v4().to_string();
    let entry = modify_state(&app, |state| add_chrome_entry(state, &detected, new_id)).await?;
    reconcile_all_live(&app).await?;
    Ok(entry)
}

/// 拡張機能の有効・無効を切り替える。
#[tauri::command]
pub async fn set_extension_enabled(
    caller: tauri::Webview,
    app: AppHandle,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    require_main_caller(&caller)?;
    ensure_supported()?;
    modify_state(&app, |state| set_enabled_in_state(state, &id, enabled)).await?;
    reconcile_all_live(&app).await?;
    Ok(())
}

/// 拡張機能を削除する。元フォルダは削除せず、アプリが作ったサニタイズコピーだけを消す。
#[tauri::command]
pub async fn remove_extension(
    caller: tauri::Webview,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    require_main_caller(&caller)?;
    ensure_supported()?;
    let removed = modify_state(&app, |state| remove_entry_from_state(state, &id)).await?;
    reconcile_all_live(&app).await?;
    let copy_root = service::copy_root(&app)?;
    if let Err(e) = tokio::task::spawn_blocking(move || cleanup_after_remove(&copy_root, &removed))
        .await
        .map_err(|e| e.to_string())?
    {
        log::warn!("[extensions] サニタイズコピーの削除に失敗: {e}");
    }
    Ok(())
}

/// 拡張機能のポップアップ / オプションページを、指定アカウントのデータで別ウィンドウに開く。
#[tauri::command]
pub async fn open_extension_page(
    caller: tauri::Webview,
    app: AppHandle,
    id: String,
    kind: String,
    #[allow(non_snake_case)] accountId: Option<String>,
) -> Result<(), String> {
    require_main_caller(&caller)?;
    ensure_supported()?;

    let state = store::load(&app)?;
    let entry = state.entries.iter().find(|e| e.id == id).cloned();
    let target = validate_open_page(entry.as_ref(), &kind, accountId.as_deref())?;
    let entry = entry.ok_or("拡張機能が見つかりません")?;
    let data_directory = resolve_account_data_directory(&app, &target.account_id)?;

    // 読み込み元フォルダの manifest から、開くページの相対パスを得る。
    let resolved = service::resolve_all(&app, std::slice::from_ref(&entry)).await?;
    let ResolvedEntry::Path(dir) = resolved
        .get(&entry.id)
        .cloned()
        .unwrap_or(ResolvedEntry::Missing)
    else {
        return Err("拡張機能のフォルダを読み込めません".to_string());
    };
    let info = manifest::read_manifest_info(std::path::Path::new(&dir), LOCALE)
        .map_err(|e| e.to_string())?;
    let relative_path = match target.kind {
        PageKind::Popup => info.popup_path,
        PageKind::Options => info.options_path,
    }
    .ok_or("開けるページがありません")?;

    // 対象プロファイルに未適用なら、そのプロファイルのカラム WebView で先に reconcile する。
    let mut webview_id = applied_webview_id(&state, &data_directory, &entry.id);
    if webview_id.is_none() {
        let targets = live_profile_targets(&app);
        let label = find_representative_label(&targets, &data_directory)
            .ok_or("このアカウントのカラムを先に表示してください")?;
        let webview = app
            .get_webview(label)
            .ok_or("このアカウントのカラムを先に表示してください")?;
        reconcile_webview(&app, &webview, &data_directory).await?;
        webview_id = applied_webview_id(&store::load(&app)?, &data_directory, &entry.id);
    }
    let webview_id = webview_id.ok_or("このアカウントに拡張機能を適用できませんでした")?;

    let url = build_extension_url(&webview_id, &relative_path)?;
    open_page_window(&app, &url, &entry.name, &data_directory, target.kind)
}

/// 拡張機能ページ用ウィンドウ。IPC の capability には含めない（リモートコンテンツに IPC を与えない）。
#[cfg(windows)]
fn open_page_window(
    app: &AppHandle,
    url: &str,
    title: &str,
    data_directory: &str,
    kind: PageKind,
) -> Result<(), String> {
    use crate::commands::webview::external_link;
    use crate::ipc_constants::labels;

    let parsed = url
        .parse::<tauri::Url>()
        .map_err(|e| format!("URL が不正です: {e}"))?;
    let label = format!(
        "{}{}",
        labels::EXTENSION_PREFIX,
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    );
    let (width, height) = match kind {
        PageKind::Popup => (400.0, 600.0),
        PageKind::Options => (900.0, 700.0),
    };
    tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(parsed))
        .title(title)
        .inner_size(width, height)
        .data_directory(std::path::PathBuf::from(data_directory))
        .browser_extensions_enabled(true)
        .on_new_window(external_link::new_window_handler(app.clone()))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn open_page_window(
    _app: &AppHandle,
    _url: &str,
    _title: &str,
    _data_directory: &str,
    _kind: PageKind,
) -> Result<(), String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn 拡張機能ページのウィンドウにも新規ウィンドウハンドラが付いている() {
        let source = include_str!("mod.rs").split("#[cfg(test)]").next().unwrap();
        let builders = source.matches("WebviewWindowBuilder::new").count();
        let handlers = source.matches("external_link::new_window_handler").count();
        assert!(builders > 0);
        assert_eq!(builders, handlers);
    }

    #[test]
    fn 拡張機能ページのウィンドウはwindows限定で拡張機能を有効にする() {
        let source = include_str!("mod.rs").split("#[cfg(test)]").next().unwrap();
        assert!(source.contains(".browser_extensions_enabled(true)"));
    }

    #[test]
    fn 拡張機能ページのラベルはextensionプレフィックスで始まる() {
        assert_eq!(crate::ipc_constants::labels::EXTENSION_PREFIX, "extension-");
    }

    #[test]
    fn 拡張機能ページのウィンドウはcapabilityの対象ウィンドウに含まれない() {
        for content in [
            include_str!("../../../capabilities/default.json"),
            include_str!("../../../capabilities/updater.json"),
            include_str!("../../../capabilities/column-webview.json"),
        ] {
            let json: serde_json::Value = serde_json::from_str(content).unwrap();
            for window in json["windows"].as_array().into_iter().flatten() {
                let window = window.as_str().unwrap();
                assert!(
                    !window.starts_with("extension-") && window != "*",
                    "{window}"
                );
            }
        }
    }
}

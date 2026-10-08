//! バックアップファイルの保存・読込（プラットフォーム差を閉じ込める層）。
//!
//! 検証・変換・適用は共通層（`format` / `restore`）が担い、ここは次の 2 関数だけを
//! プラットフォームごとに実装する。
//! - `save_backup_file`: 利用者が選んだ場所へバイト列を書く（キャンセルは `Ok(false)`）
//! - `pick_backup_file`: 利用者が選んだファイルを上限付きで読む（キャンセルは `Ok(None)`）
//!
//! desktop は `tauri-plugin-dialog` + Rust のファイル I/O、Android は Kotlin 側の SAF
//! （`MainActivity.startBackupExport` / `startBackupImport`）と JNI で連携する。

use std::io::Read;
use std::path::Path;

use super::format::{BackupError, MAX_FILE_BYTES};

#[cfg(desktop)]
const DIALOG_FILTER_NAME: &str = "Multi Column X バックアップ";

fn io_error(e: impl std::fmt::Display) -> BackupError {
    BackupError::Io {
        message: e.to_string(),
    }
}

/// ファイルを `MAX_FILE_BYTES` を上限に読む。上限を超えるファイルは中身を読まずに `TooLarge`。
/// サイズが事前に分からない場合に備え、上限 + 1 バイトで読み込みを打ち切って再判定する。
pub(crate) fn read_limited(path: &Path) -> Result<Vec<u8>, BackupError> {
    let too_large = |size: u64| BackupError::TooLarge {
        size,
        limit: MAX_FILE_BYTES as u64,
    };
    let file = std::fs::File::open(path).map_err(io_error)?;
    let size = file.metadata().map_err(io_error)?.len();
    if size > MAX_FILE_BYTES as u64 {
        return Err(too_large(size));
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(too_large(bytes.len() as u64));
    }
    Ok(bytes)
}

// ---------------------------------------------------------------------------
// desktop（Windows / macOS / Linux）
// ---------------------------------------------------------------------------

#[cfg(desktop)]
pub(crate) async fn save_backup_file(
    app: &tauri::AppHandle,
    file_name: &str,
    bytes: Vec<u8>,
) -> Result<bool, BackupError> {
    use tauri_plugin_dialog::DialogExt;

    // ダイアログ待ちで tokio ワーカーを占有しないよう、コールバックを oneshot で受ける。
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(file_name)
        .add_filter(DIALOG_FILTER_NAME, &["json"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    let Some(path) = rx.await.map_err(io_error)? else {
        return Ok(false);
    };
    let path = path.into_path().map_err(io_error)?;
    tokio::fs::write(&path, bytes).await.map_err(io_error)?;
    Ok(true)
}

#[cfg(desktop)]
pub(crate) async fn pick_backup_file(
    app: &tauri::AppHandle,
) -> Result<Option<Vec<u8>>, BackupError> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(DIALOG_FILTER_NAME, &["json"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    let Some(path) = rx.await.map_err(io_error)? else {
        return Ok(None);
    };
    let path = path.into_path().map_err(io_error)?;
    tokio::task::spawn_blocking(move || read_limited(&path))
        .await
        .map_err(io_error)?
        .map(Some)
}

// ---------------------------------------------------------------------------
// Android（SAF）。Kotlin からの完了通知を待ち受ける。
// ---------------------------------------------------------------------------

/// Kotlin（`AppBridge.onBackupFileResult(status, detail)`）からの完了通知。
#[cfg(any(test, mobile))]
#[derive(Debug, PartialEq)]
pub(crate) enum BridgeResult {
    /// 保存先へ書き込めた。
    Saved,
    /// 選択したファイルを一時ファイルへコピーできた。
    Picked,
    /// 利用者がダイアログをキャンセルした。
    Cancelled,
    /// 選択したファイルが上限を超えていた。
    TooLarge,
    /// 失敗（中身は原因）。
    Failed(String),
}

#[cfg(any(test, mobile))]
impl BridgeResult {
    /// Kotlin が渡す `status` 文字列から変換する。未知の値は失敗として扱う。
    pub(crate) fn from_bridge(status: &str, detail: &str) -> Self {
        match status {
            "saved" => Self::Saved,
            "picked" => Self::Picked,
            "cancelled" => Self::Cancelled,
            "tooLarge" => Self::TooLarge,
            "error" => Self::Failed(detail.to_string()),
            other => Self::Failed(format!("unknown status: {other}")),
        }
    }
}

#[cfg(any(test, mobile))]
static BRIDGE_WAITER: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<BridgeResult>>> =
    std::sync::Mutex::new(None);

/// 完了通知の待受を登録する。進行中の要求があれば、その待受は破棄される（受信側はエラーになる）。
#[cfg(any(test, mobile))]
pub(crate) fn register_bridge_waiter() -> tokio::sync::oneshot::Receiver<BridgeResult> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    *BRIDGE_WAITER.lock().unwrap_or_else(|e| e.into_inner()) = Some(tx);
    rx
}

/// Kotlin からの完了通知を待受へ渡す。待受が無ければ捨てる。
#[cfg(any(test, mobile))]
pub(crate) fn deliver_bridge_result(result: BridgeResult) {
    let sender = BRIDGE_WAITER
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();
    if let Some(tx) = sender {
        let _ = tx.send(result);
    }
}

/// 利用者の操作を待つ最大時間。
#[cfg(mobile)]
const BRIDGE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10 * 60);

#[cfg(mobile)]
async fn await_bridge_result(
    rx: tokio::sync::oneshot::Receiver<BridgeResult>,
) -> Result<BridgeResult, BackupError> {
    match tokio::time::timeout(BRIDGE_TIMEOUT, rx).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => Err(io_error("ファイル選択が中断されました")),
        Err(_) => Err(io_error("ファイル選択がタイムアウトしました")),
    }
}

#[cfg(mobile)]
fn temp_path(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, BackupError> {
    use tauri::Manager;
    let dir = app.path().app_cache_dir().map_err(io_error)?;
    std::fs::create_dir_all(&dir).map_err(io_error)?;
    Ok(dir.join(name))
}

#[cfg(mobile)]
pub(crate) async fn save_backup_file(
    app: &tauri::AppHandle,
    file_name: &str,
    bytes: Vec<u8>,
) -> Result<bool, BackupError> {
    let temp = temp_path(app, "backup-export.tmp")?;
    std::fs::write(&temp, bytes).map_err(io_error)?;

    let rx = register_bridge_waiter();
    let started = crate::android_bridge::start_backup_export(&temp.to_string_lossy(), file_name);
    let outcome = match started {
        Ok(()) => await_bridge_result(rx).await,
        Err(e) => Err(io_error(e)),
    };
    let _ = std::fs::remove_file(&temp);

    match outcome? {
        BridgeResult::Saved => Ok(true),
        BridgeResult::Cancelled => Ok(false),
        BridgeResult::Failed(message) => Err(io_error(message)),
        other => Err(io_error(format!("想定外の応答: {other:?}"))),
    }
}

#[cfg(mobile)]
pub(crate) async fn pick_backup_file(
    app: &tauri::AppHandle,
) -> Result<Option<Vec<u8>>, BackupError> {
    let temp = temp_path(app, "backup-import.tmp")?;
    let _ = std::fs::remove_file(&temp);

    let rx = register_bridge_waiter();
    // Kotlin 側は上限を超えた時点でコピーを打ち切る。Rust 側でも read_limited で再検査する（二重防御）。
    let started =
        crate::android_bridge::start_backup_import(&temp.to_string_lossy(), MAX_FILE_BYTES as i64);
    let outcome = match started {
        Ok(()) => await_bridge_result(rx).await,
        Err(e) => Err(io_error(e)),
    };
    let result = match outcome {
        Ok(BridgeResult::Picked) => read_limited(&temp).map(Some),
        Ok(BridgeResult::Cancelled) => Ok(None),
        Ok(BridgeResult::TooLarge) => Err(BackupError::TooLarge {
            size: MAX_FILE_BYTES as u64 + 1,
            limit: MAX_FILE_BYTES as u64,
        }),
        Ok(BridgeResult::Failed(message)) => Err(io_error(message)),
        Ok(other) => Err(io_error(format!("想定外の応答: {other:?}"))),
        Err(e) => Err(e),
    };
    let _ = std::fs::remove_file(&temp);
    result
}

//! WebView2（ICoreWebView2Profile7）の拡張機能 API への非同期ブリッジ（Windows 専用）。
//!
//! 完了ハンドラは UI スレッドで呼ばれるため、ハンドラや `with_webview` のクロージャ内では
//! 同期待ちをしない。結果は `oneshot` で async 側へ返し、各呼び出しにタイムアウトを付ける。
// 後続ステップ（コマンド・reconcile 実行）で使用するまで未使用の項目がある。
#![allow(dead_code)]

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use tokio::sync::oneshot;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2BrowserExtension, ICoreWebView2Profile7, ICoreWebView2_13,
};
use webview2_com::{
    take_pwstr, BrowserExtensionEnableCompletedHandler, BrowserExtensionRemoveCompletedHandler,
    ProfileAddBrowserExtensionCompletedHandler, ProfileGetBrowserExtensionsCompletedHandler,
};
use windows_core::{Interface, BOOL, HSTRING, PWSTR};

use super::executor::{apply_actions_with, ProfileOps};
use super::hresult::describe_add_error;
use super::reconcile_plan::{Action, InstalledExt};

pub use super::executor::ApplyOutcome;

/// 各 WebView2 呼び出しのタイムアウト。
const CALL_TIMEOUT: Duration = Duration::from_secs(10);

type Reply<T> = Rc<RefCell<Option<oneshot::Sender<Result<T, String>>>>>;

/// 応答を 1 度だけ返す（2 度目以降は無視）。
fn reply<T>(slot: &Reply<T>, value: Result<T, String>) {
    if let Some(tx) = slot.borrow_mut().take() {
        let _ = tx.send(value);
    }
}

fn hresult_message(action: &str, hr: i32) -> String {
    format!("{action}（0x{:08X}）", hr as u32)
}

/// UI スレッドで Profile7 を取得して `f` を実行し、`f` が `Reply` で返した結果を待つ。
async fn with_profile<T, F>(webview: &tauri::Webview, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(ICoreWebView2Profile7, Reply<T>) + Send + 'static,
{
    let (tx, rx) = oneshot::channel::<Result<T, String>>();
    webview
        .with_webview(move |pw| {
            let slot: Reply<T> = Rc::new(RefCell::new(Some(tx)));
            // SAFETY: with_webview のクロージャは UI スレッドで実行され、COM オブジェクトはその間だけ使う。
            let profile = unsafe {
                pw.controller()
                    .CoreWebView2()
                    .and_then(|core| core.cast::<ICoreWebView2_13>())
                    .and_then(|core| core.Profile())
                    .and_then(|p| p.cast::<ICoreWebView2Profile7>())
            };
            match profile {
                Ok(p) => f(p, slot),
                Err(e) => reply(&slot, Err(format!("プロファイルを取得できません: {e}"))),
            }
        })
        .map_err(|e| format!("WebView へアクセスできません: {e}"))?;
    match tokio::time::timeout(CALL_TIMEOUT, rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("WebView2 から応答がありませんでした".to_string()),
        Err(_) => Err("WebView2 の応答がタイムアウトしました".to_string()),
    }
}

fn installed_of(ext: &ICoreWebView2BrowserExtension) -> InstalledExt {
    // SAFETY: 出力引数は呼び出し前に初期化済み。PWSTR は take_pwstr で解放する。
    unsafe {
        let mut id = PWSTR::null();
        let mut enabled = BOOL(0);
        let _ = ext.Id(&mut id);
        let _ = ext.IsEnabled(&mut enabled);
        InstalledExt {
            id: take_pwstr(id),
            enabled: enabled.as_bool(),
        }
    }
}

/// `GetBrowserExtensions` で `webview_id` に一致する要素を探し、見つかれば `op` を実行する。
/// `op` は完了結果を `Reply` へ返す責務を持つ。見つからなければエラーを返す。
async fn with_extension<F>(webview: &tauri::Webview, webview_id: &str, op: F) -> Result<(), String>
where
    F: FnOnce(ICoreWebView2BrowserExtension, Reply<()>) + Send + 'static,
{
    let target = webview_id.to_string();
    with_profile::<(), _>(webview, move |profile, slot| {
        let slot_for_handler = slot.clone();
        let handler =
            ProfileGetBrowserExtensionsCompletedHandler::create(Box::new(move |hr, list| {
                if let Err(e) = &hr {
                    let msg = hresult_message("拡張機能の一覧を取得できません", e.code().0);
                    reply(&slot_for_handler, Err(msg));
                    return Ok(());
                }
                // SAFETY: UI スレッド上（完了ハンドラ内）で COM コレクションを読む。
                let found = list.and_then(|l| unsafe {
                    let mut count = 0u32;
                    let _ = l.Count(&mut count);
                    (0..count)
                        .filter_map(|i| l.GetValueAtIndex(i).ok())
                        .find(|e| installed_of(e).id == target)
                });
                match found {
                    Some(ext) => op(ext, slot_for_handler),
                    None => reply(
                        &slot_for_handler,
                        Err("拡張機能が見つかりません".to_string()),
                    ),
                }
                Ok(())
            }));
        // SAFETY: UI スレッド上で呼ぶ。
        if let Err(e) = unsafe { profile.GetBrowserExtensions(&handler) } {
            reply(&slot, Err(format!("拡張機能の一覧を取得できません: {e}")));
        }
    })
    .await
}

/// インストール済みの拡張機能を一覧する（既定の Microsoft 拡張も含む）。
pub async fn list_installed(webview: &tauri::Webview) -> Result<Vec<InstalledExt>, String> {
    with_profile(webview, |profile, slot| {
        let slot_for_handler = slot.clone();
        let handler =
            ProfileGetBrowserExtensionsCompletedHandler::create(Box::new(move |hr, list| {
                if let Err(e) = &hr {
                    let msg = hresult_message("拡張機能の一覧を取得できません", e.code().0);
                    reply(&slot_for_handler, Err(msg));
                    return Ok(());
                }
                // SAFETY: UI スレッド上（完了ハンドラ内）で COM コレクションを読む。
                let exts = list
                    .map(|l| unsafe {
                        let mut count = 0u32;
                        let _ = l.Count(&mut count);
                        (0..count)
                            .filter_map(|i| l.GetValueAtIndex(i).ok())
                            .map(|e| installed_of(&e))
                            .collect()
                    })
                    .unwrap_or_default();
                reply(&slot_for_handler, Ok(exts));
                Ok(())
            }));
        // SAFETY: UI スレッド上で呼ぶ。
        if let Err(e) = unsafe { profile.GetBrowserExtensions(&handler) } {
            reply(&slot, Err(format!("拡張機能の一覧を取得できません: {e}")));
        }
    })
    .await
}

/// 展開済みフォルダ `path` を拡張機能として追加する。
pub async fn add(webview: &tauri::Webview, path: &str) -> Result<InstalledExt, String> {
    let path = HSTRING::from(path);
    with_profile(webview, move |profile, slot| {
        let slot_for_handler = slot.clone();
        let handler =
            ProfileAddBrowserExtensionCompletedHandler::create(Box::new(move |hr, ext| {
                let result = match (&hr, ext) {
                    (Ok(()), Some(e)) => Ok(installed_of(&e)),
                    (Err(e), _) => Err(describe_add_error(e.code().0)),
                    // 成功なのに拡張機能が返らない異常系は汎用失敗として扱う。
                    (Ok(()), None) => Err(describe_add_error(0x8000_4005_u32 as i32)),
                };
                reply(&slot_for_handler, result);
                Ok(())
            }));
        // SAFETY: UI スレッド上で呼ぶ。
        if let Err(e) = unsafe { profile.AddBrowserExtension(&path, &handler) } {
            reply(&slot, Err(describe_add_error(e.code().0)));
        }
    })
    .await
}

/// 拡張機能を削除する。
pub async fn remove(webview: &tauri::Webview, webview_id: &str) -> Result<(), String> {
    with_extension(webview, webview_id, |ext, slot| {
        let slot_for_handler = slot.clone();
        let handler = BrowserExtensionRemoveCompletedHandler::create(Box::new(move |hr| {
            let result = hr.map_err(|e| hresult_message("拡張機能を削除できません", e.code().0));
            reply(&slot_for_handler, result);
            Ok(())
        }));
        // SAFETY: UI スレッド上で呼ぶ。
        if let Err(e) = unsafe { ext.Remove(&handler) } {
            reply(&slot, Err(format!("拡張機能を削除できません: {e}")));
        }
    })
    .await
}

/// 拡張機能の有効／無効を切り替える。
pub async fn set_enabled(
    webview: &tauri::Webview,
    webview_id: &str,
    enabled: bool,
) -> Result<(), String> {
    with_extension(webview, webview_id, move |ext, slot| {
        let slot_for_handler = slot.clone();
        let handler = BrowserExtensionEnableCompletedHandler::create(Box::new(move |hr| {
            let result =
                hr.map_err(|e| hresult_message("拡張機能の有効状態を変更できません", e.code().0));
            reply(&slot_for_handler, result);
            Ok(())
        }));
        // SAFETY: UI スレッド上で呼ぶ。
        if let Err(e) = unsafe { ext.Enable(enabled, &handler) } {
            reply(
                &slot,
                Err(format!("拡張機能の有効状態を変更できません: {e}")),
            );
        }
    })
    .await
}

/// `ProfileOps` の WebView2 実装。
struct WebviewOps<'a>(&'a tauri::Webview);

impl ProfileOps for WebviewOps<'_> {
    async fn list(&self) -> Result<Vec<InstalledExt>, String> {
        list_installed(self.0).await
    }
    async fn add(&self, path: &str) -> Result<InstalledExt, String> {
        add(self.0, path).await
    }
    async fn remove(&self, webview_id: &str) -> Result<(), String> {
        remove(self.0, webview_id).await
    }
    async fn set_enabled(&self, webview_id: &str, enabled: bool) -> Result<(), String> {
        set_enabled(self.0, webview_id, enabled).await
    }
}

/// 同期計画を Add → Remove → SetEnabled の順に実行する。
pub async fn apply_actions(webview: &tauri::Webview, actions: &[Action]) -> ApplyOutcome {
    apply_actions_with(&WebviewOps(webview), actions).await
}

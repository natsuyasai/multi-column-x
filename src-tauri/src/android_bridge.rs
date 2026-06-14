//! Kotlin から Activity 参照を受け取り、AddAccount 起動に使う JNI ブリッジ。
//! MainActivity.onCreate → AppBridge.initContext(this) → ここの JNI 関数 の順で初期化される。

use jni::objects::{GlobalRef, JClass, JObject, JValue};
use jni::sys::jboolean;
use jni::{JNIEnv, JavaVM};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Mutex;

static MAIN_ACTIVITY: Mutex<Option<(JavaVM, GlobalRef)>> = Mutex::new(None);

/// Tauri AppHandle（back ボタンでポップアップを閉じるイベント emit に使う）。
static TAURI_APP: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);

/// 現在開いているポップアップウィンドウ数。back ボタン処理の可否判定に使う。
static POPUP_COUNT: AtomicI32 = AtomicI32::new(0);

/// アプリ起動時に AppHandle を保存する。
pub fn store_app_handle(app: tauri::AppHandle) {
    *TAURI_APP.lock().unwrap() = Some(app);
}

/// ポップアップ/コンポーズウィンドウが開かれたときに呼ぶ。
pub fn increment_popup_count() {
    POPUP_COUNT.fetch_add(1, Ordering::Relaxed);
}

/// ポップアップ/コンポーズウィンドウが閉じられたときに呼ぶ。
pub fn decrement_popup_count() {
    let prev = POPUP_COUNT.fetch_sub(1, Ordering::Relaxed);
    if prev <= 0 {
        POPUP_COUNT.store(0, Ordering::Relaxed);
    }
}

/// AppBridge.closeTopPopup() から呼ばれる JNI エントリポイント。
/// ポップアップが開いていれば close-topmost-popup イベントを emit して true を返す。
/// 開いていなければ false を返してデフォルトの back 動作に委ねる。
#[no_mangle]
pub unsafe extern "C" fn Java_com_natsuyasai_multicolumnx_AppBridge_closeTopPopup<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jboolean {
    use tauri::Emitter;
    if POPUP_COUNT.load(Ordering::Relaxed) <= 0 {
        return 0;
    }
    let guard = TAURI_APP.lock().unwrap();
    if let Some(app) = guard.as_ref() {
        let _ = app.emit(crate::ipc_constants::events::CLOSE_TOPMOST_POPUP, ());
        1
    } else {
        0
    }
}

/// AppBridge.onDoubleTap() から呼ばれる JNI エントリポイント。
/// アクティブカラムのダブルタップを column-double-tap イベントとして React に通知する。
#[no_mangle]
pub unsafe extern "C" fn Java_com_natsuyasai_multicolumnx_AppBridge_onDoubleTap<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
) {
    use tauri::Emitter;
    let guard = TAURI_APP.lock().unwrap();
    if let Some(app) = guard.as_ref() {
        let _ = app.emit(crate::ipc_constants::events::COLUMN_DOUBLE_TAP, ());
    }
}

/// AppBridge.onPopupSwitchSession(popupId, accountId, url) から呼ばれる JNI エントリポイント。
/// ポップアップツールバーのアカウント切替を受け取り、ポップアップを選択アカウントの
/// セッションで再作成する。
///
/// WebView の JavaBridge スレッドから呼ばれ、再作成は呼び出し元 WebView 自身の
/// destroy を伴うため、ブロックせず別タスクへ逃がしてから即座に返す。
#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_natsuyasai_multicolumnx_AppBridge_onPopupSwitchSession<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    popup_id: jni::objects::JString<'local>,
    account_id: jni::objects::JString<'local>,
    url: jni::objects::JString<'local>,
) {
    fn to_string(env: &mut JNIEnv, s: &jni::objects::JString) -> Option<String> {
        env.get_string(s).ok().map(|v| v.into())
    }
    let (Some(popup_id), Some(account_id), Some(url)) = (
        to_string(&mut env, &popup_id),
        to_string(&mut env, &account_id),
        to_string(&mut env, &url),
    ) else {
        return;
    };
    let app = TAURI_APP.lock().unwrap().clone();
    let Some(app) = app else {
        eprintln!("[AppBridge.onPopupSwitchSession] app handle not initialized");
        return;
    };
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::commands::webview::switch_popup_session_android(
            &app,
            &popup_id,
            &account_id,
            &url,
        ) {
            eprintln!("[AppBridge.onPopupSwitchSession] {e}");
        }
    });
}

/// Kotlin から受け取ったシステムバーの高さ（dp）。
static STATUS_BAR_HEIGHT_DP: AtomicI32 = AtomicI32::new(0);
static NAV_BAR_HEIGHT_DP: AtomicI32 = AtomicI32::new(0);

/// AppBridge.onInsets(top, bottom) から呼ばれる JNI エントリポイント。
/// ステータスバー・ナビゲーションバーの高さ（dp）を保存する。
#[no_mangle]
pub unsafe extern "C" fn Java_com_natsuyasai_multicolumnx_AppBridge_onInsets<'local>(
    _env: JNIEnv<'local>,
    _class: JClass<'local>,
    top: i32,
    bottom: i32,
) {
    eprintln!("[AppBridge.onInsets] top={top}dp bottom={bottom}dp");
    STATUS_BAR_HEIGHT_DP.store(top, Ordering::Relaxed);
    NAV_BAR_HEIGHT_DP.store(bottom, Ordering::Relaxed);
}

/// JS 側から呼ばれる get_mobile_insets コマンド用のゲッター。
pub fn get_system_bar_insets() -> (i32, i32) {
    let top = STATUS_BAR_HEIGHT_DP.load(Ordering::Relaxed);
    let bottom = NAV_BAR_HEIGHT_DP.load(Ordering::Relaxed);
    eprintln!("[get_system_bar_insets] top={top}dp bottom={bottom}dp");
    (top, bottom)
}

/// AppBridge.initContext(activity) から呼ばれる JNI エントリポイント。
/// MainActivity の GlobalRef を保存する。
#[no_mangle]
pub unsafe extern "C" fn Java_com_natsuyasai_multicolumnx_AppBridge_initContext<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    activity: JObject<'local>,
) {
    let vm = match env.get_java_vm() {
        Ok(vm) => vm,
        Err(e) => {
            eprintln!("[AppBridge] get_java_vm: {e}");
            return;
        }
    };
    let global_ref = match env.new_global_ref(&activity) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[AppBridge] new_global_ref: {e}");
            return;
        }
    };
    *MAIN_ACTIVITY.lock().unwrap() = Some((vm, global_ref));
    println!("[AppBridge] context initialized");
}

/// MainActivity.launchAddAccount(accountId) 経由で AddAccount Activity を起動する。
/// accountId は AddAccount Activity に Intent Extra として渡され、WebView Profile の分離に使われる。
/// MainActivity.launchComposeTweet() 経由で X アプリのツイート画面を Intent で起動する。
/// X アプリが未インストールの場合はブラウザの x.com にフォールバックする。
pub fn launch_compose_tweet_intent() -> Result<(), String> {
    call_activity_method(|env, activity| {
        env.call_method(activity, "launchComposeTweet", "()V", &[])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.launchAddAccount(accountId) 経由で AddAccount Activity を起動する。
/// accountId は AddAccount Activity に Intent Extra として渡され、WebView Profile の分離に使われる。
pub fn launch_add_account_activity(account_id: &str) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_account_id = env.new_string(account_id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "launchAddAccount",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&*j_account_id)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

// ── カラム WebView ネイティブ操作 ────────────────────────────────────────

/// MainActivity.createColumnWebView を呼び出してカラム WebView を生成する。
/// width_dp / height_dp は CSS px（= dp）で受け取る。
/// account_id はアカウントごとの WebView Profile 分離に使われる。
pub fn create_column_webview(
    id: &str,
    url: &str,
    width_dp: i32,
    height_dp: i32,
    init_script: &str,
    visible: bool,
    account_id: &str,
) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(id).map_err(|e| e.to_string())?;
        let j_url = env.new_string(url).map_err(|e| e.to_string())?;
        let j_script = env.new_string(init_script).map_err(|e| e.to_string())?;
        let j_account_id = env.new_string(account_id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "createColumnWebView",
            "(Ljava/lang/String;Ljava/lang/String;IILjava/lang/String;ZLjava/lang/String;)V",
            &[
                JValue::Object(&*j_id),
                JValue::Object(&*j_url),
                JValue::Int(width_dp),
                JValue::Int(height_dp),
                JValue::Object(&*j_script),
                JValue::Bool(visible as u8),
                JValue::Object(&*j_account_id),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.removeColumnWebView を呼び出してカラム WebView を削除する。
pub fn remove_column_webview(id: &str) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "removeColumnWebView",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&*j_id)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.showColumnWebView を呼び出してカラム WebView を表示する。
pub fn show_column_webview(id: &str, width_dp: i32, height_dp: i32) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "showColumnWebView",
            "(Ljava/lang/String;II)V",
            &[
                JValue::Object(&*j_id),
                JValue::Int(width_dp),
                JValue::Int(height_dp),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.hideColumnWebView を呼び出してカラム WebView を非表示にする。
pub fn hide_column_webview(id: &str) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "hideColumnWebView",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&*j_id)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.evalInColumnWebView を呼び出してカラム WebView で JS を評価する。
pub fn eval_in_column_webview(id: &str, script: &str) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(id).map_err(|e| e.to_string())?;
        let j_script = env.new_string(script).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "evalInColumnWebView",
            "(Ljava/lang/String;Ljava/lang/String;)V",
            &[JValue::Object(&*j_id), JValue::Object(&*j_script)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.createPopupWebView を呼び出して全画面ポップアップ WebView を生成する。
pub fn create_popup_webview(
    id: &str,
    url: &str,
    init_script: &str,
    account_id: &str,
) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(id).map_err(|e| e.to_string())?;
        let j_url = env.new_string(url).map_err(|e| e.to_string())?;
        let j_script = env.new_string(init_script).map_err(|e| e.to_string())?;
        let j_account_id = env.new_string(account_id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "createPopupWebView",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
            &[
                JValue::Object(&*j_id),
                JValue::Object(&*j_url),
                JValue::Object(&*j_script),
                JValue::Object(&*j_account_id),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.removePopupWebView を呼び出してポップアップ WebView を削除する。
pub fn remove_popup_webview(id: &str) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "removePopupWebView",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&*j_id)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MainActivity.setAccountCookies を呼び出して CookieManager を指定アカウントに切り替える。
/// showColumnWebView とは独立しているため、WebView の表示状態に影響しない。
pub fn set_account_cookies(account_id: &str) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_id = env.new_string(account_id).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "setAccountCookies",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&*j_id)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// MAIN_ACTIVITY の JavaVM / GlobalRef を使って JNI 処理を実行するヘルパー。
fn call_activity_method<F>(f: F) -> Result<(), String>
where
    F: FnOnce(&mut JNIEnv, &JObject) -> Result<(), String>,
{
    let guard = MAIN_ACTIVITY
        .lock()
        .map_err(|e| format!("mutex lock: {e}"))?;
    let (vm, activity_ref) = guard.as_ref().ok_or("android context not initialized")?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("attach_current_thread: {e}"))?;
    // pending exception をクリアしてから呼び出し、後続 JNI 呼び出しへの影響を防ぐ
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_clear();
    }
    let result = f(&mut env, activity_ref.as_obj());
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_clear();
    }
    result
}

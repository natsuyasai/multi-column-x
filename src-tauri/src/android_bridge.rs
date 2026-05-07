//! Kotlin から Activity 参照を受け取り、AddAccount 起動に使う JNI ブリッジ。
//! MainActivity.onCreate → AppBridge.initContext(this) → ここの JNI 関数 の順で初期化される。

use jni::objects::{GlobalRef, JClass, JObject, JValue};
use jni::{JNIEnv, JavaVM};
use std::sync::Mutex;
use std::sync::atomic::{AtomicI32, Ordering};

static MAIN_ACTIVITY: Mutex<Option<(JavaVM, GlobalRef)>> = Mutex::new(None);

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

/// WryActivity.getAppClass + WryActivity.startActivity 経由で AddAccount を起動する。
pub fn launch_add_account_activity() -> Result<(), String> {
    let guard = MAIN_ACTIVITY
        .lock()
        .map_err(|e| format!("mutex lock: {e}"))?;
    let (vm, activity_ref) = guard
        .as_ref()
        .ok_or("android context not initialized — AppBridge.initContext が呼ばれていない")?;

    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("attach_current_thread: {e}"))?;

    let class_name = env
        .new_string("com.natsuyasai.multicolumnx.AddAccount")
        .map_err(|e| format!("new_string: {e}"))?;

    // WryActivity.getAppClass(name: String): Class<*>
    let add_account_class = env
        .call_method(
            activity_ref.as_obj(),
            "getAppClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(&*class_name)],
        )
        .map_err(|e| format!("getAppClass: {e}"))?
        .l()
        .map_err(|e| format!("getAppClass l(): {e}"))?;

    // WryActivity.startActivity(cls: Class<*>): Int
    env.call_method(
        activity_ref.as_obj(),
        "startActivity",
        "(Ljava/lang/Class;)I",
        &[JValue::Object(&add_account_class)],
    )
    .map_err(|e| format!("startActivity: {e}"))?;

    Ok(())
}

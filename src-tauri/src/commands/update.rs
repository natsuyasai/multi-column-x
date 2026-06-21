//! アプリ更新コマンド（Android: APK 自己更新）。
//! デスクトップは tauri-plugin-updater が担うため、ここでは Android のみ実装する。

/// Android で APK をダウンロードして OS のインストーラを起動する。
/// それ以外のプラットフォームでは未対応エラーを返す。
#[tauri::command]
pub async fn install_apk_update(url: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::android_bridge::download_and_install_apk(&url);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = url;
        Err("install_apk_update is only supported on Android".into())
    }
}

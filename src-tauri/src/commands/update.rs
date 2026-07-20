//! アプリ更新コマンド（Android: APK 自己更新）。
//! デスクトップは tauri-plugin-updater が担うため、ここでは Android のみ実装する。

/// APK ダウンロード URL として許可する唯一のプレフィックス（自リポジトリの GitHub Releases）。
const ALLOWED_APK_URL_PREFIX: &str =
    "https://github.com/natsuyasai/multi-column-x/releases/download/";

/// APK 更新リクエストの検証（純関数・全プラットフォームでテスト可能）。
/// - 呼び出し元は main ウィンドウのみ（x.com を表示する column/popup WebView からの invoke を拒否）
/// - URL は自リポジトリの GitHub Releases ダウンロード URL のみ許可
/// - expected_sha256 は 64 桁 hex
pub(crate) fn validate_install_request(
    window_label: &str,
    url: &str,
    expected_sha256: &str,
) -> Result<(), String> {
    if window_label != "main" {
        return Err("install_apk_update is only allowed from the main window".into());
    }
    let rest = url
        .strip_prefix(ALLOWED_APK_URL_PREFIX)
        .ok_or_else(|| "invalid apk url: not an allowed release download url".to_string())?;
    if rest.contains("..")
        || rest.contains('\\')
        || rest.contains('?')
        || rest.contains('#')
        || rest.contains('@')
        || rest.chars().any(|c| c.is_whitespace())
    {
        return Err("invalid apk url: forbidden characters".into());
    }
    if !rest.ends_with(".apk") {
        return Err("invalid apk url: not an apk asset".into());
    }
    if expected_sha256.len() != 64 || !expected_sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid expected sha256".into());
    }
    Ok(())
}

/// Android で APK をダウンロードして OS のインストーラを起動する。
/// それ以外のプラットフォームでは未対応エラーを返す。
/// 呼び出し元は main ウィンドウのみ許可し、URL は自リポジトリの GitHub Releases のみ許可する
/// （x.com を表示する column/popup WebView に IPC が付与されているため、任意 URL のインストールを防ぐ）。
#[tauri::command]
pub async fn install_apk_update(
    window: tauri::Window,
    url: String,
    expected_sha256: String,
) -> Result<(), String> {
    validate_install_request(window.label(), &url, &expected_sha256)?;
    #[cfg(target_os = "android")]
    {
        return crate::android_bridge::download_and_install_apk(&url, &expected_sha256);
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("install_apk_update is only supported on Android".into())
    }
}

#[cfg(all(test, not(target_os = "android")))]
mod tests {
    use super::*;

    const VALID_URL: &str =
        "https://github.com/natsuyasai/multi-column-x/releases/download/v1.0.0/app.apk";
    const VALID_SHA256: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn mainウィンドウ_許可プレフィックスのapk_64桁hexで正常終了する() {
        let result = validate_install_request("main", VALID_URL, VALID_SHA256);
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn mainでないウィンドウからの呼び出しを拒否する() {
        let result = validate_install_request("column-0", VALID_URL, VALID_SHA256);
        assert_eq!(
            result,
            Err("install_apk_update is only allowed from the main window".to_string())
        );
    }

    #[test]
    fn 許可プレフィックス以外のurlを拒否する() {
        let result =
            validate_install_request("main", "https://evil.example.com/x.apk", VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn urlにドット2つを含む場合を拒否する() {
        let url =
            "https://github.com/natsuyasai/multi-column-x/releases/download/../../etc/passwd.apk";
        let result = validate_install_request("main", url, VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn urlにアットマークを含む場合を拒否する() {
        let url = "https://github.com/natsuyasai/multi-column-x/releases/download/v1.0.0/app.apk@evil.com";
        let result = validate_install_request("main", url, VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn urlにクエリを含む場合を拒否する() {
        let url =
            "https://github.com/natsuyasai/multi-column-x/releases/download/v1.0.0/app.apk?x=1";
        let result = validate_install_request("main", url, VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn urlにハッシュを含む場合を拒否する() {
        let url =
            "https://github.com/natsuyasai/multi-column-x/releases/download/v1.0.0/app.apk#frag";
        let result = validate_install_request("main", url, VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn urlにバックスラッシュを含む場合を拒否する() {
        let url = "https://github.com/natsuyasai/multi-column-x/releases/download/v1.0.0/app\\.apk";
        let result = validate_install_request("main", url, VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn urlに空白を含む場合を拒否する() {
        let url = "https://github.com/natsuyasai/multi-column-x/releases/download/v1.0.0/app .apk";
        let result = validate_install_request("main", url, VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn apkで終わらないurlを拒否する() {
        let url = "https://github.com/natsuyasai/multi-column-x/releases/download/v1.0.0/app.zip";
        let result = validate_install_request("main", url, VALID_SHA256);
        assert!(result.is_err());
    }

    #[test]
    fn sha256が短い場合を拒否する() {
        let result = validate_install_request("main", VALID_URL, "0123456789abcdef");
        assert!(result.is_err());
    }

    #[test]
    fn sha256が長い場合を拒否する() {
        let too_long = format!("{VALID_SHA256}00");
        let result = validate_install_request("main", VALID_URL, &too_long);
        assert!(result.is_err());
    }

    #[test]
    fn sha256に非hex文字を含む場合を拒否する() {
        let invalid = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
        let result = validate_install_request("main", VALID_URL, invalid);
        assert!(result.is_err());
    }

    #[test]
    fn 有効なhexは大文字小文字混在でも受け入れる() {
        let mixed_case = "0123456789ABCDEF0123456789abcdef0123456789ABCDEF0123456789abcdef";
        let result = validate_install_request("main", VALID_URL, mixed_case);
        assert_eq!(result, Ok(()));
    }
}

//! Linux AppImage版で、Cisco公式サーバーからOpenH264バイナリを
//! ユーザー操作時に直接ダウンロードし有効化するコマンド。
//! Cisco の特許ロイヤリティ負担は「Ciscoの配布チャネルから直接ダウンロードする」
//! 場合にのみ適用されるため、AppImageには同梱せずこの方式を採る。

const OPENH264_VERSION: &str = "2.4.1";
// x86_64 (amd64) 用の実測値。ダウンロードして一致確認済み。
const OPENH264_SHA256_AMD64: &str =
    "ca413853d99d960ebcd5ae5b4c65a85bb2b5598e9042e64700a9f4b737ca3a3f";

/// Cisco公式配布サーバーのダウンロードURLを組み立てる（純粋関数）。
pub(crate) fn build_download_url(version: &str) -> String {
    format!("http://ciscobinary.openh264.org/libopenh264-{version}-linux64.7.so.bz2")
}

/// ダウンロードしたバイト列が expected_hex（64桁hex, 大文字小文字問わず）と
/// 一致するか検証する（純粋関数）。
pub(crate) fn verify_sha256(data: &[u8], expected_hex: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    let actual = hasher.finalize();
    let actual_hex: String = actual.iter().map(|b| format!("{b:02x}")).collect();
    if actual_hex.eq_ignore_ascii_case(expected_hex) {
        Ok(())
    } else {
        Err(format!(
            "sha256 mismatch: expected {expected_hex}, got {actual_hex}"
        ))
    }
}

/// bzip2圧縮されたバイト列を展開する。
pub(crate) fn decompress_bz2(data: &[u8]) -> Result<Vec<u8>, String> {
    use bzip2::read::BzDecoder;
    use std::io::Read;
    let mut decoder = BzDecoder::new(data);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|e| format!("bzip2展開に失敗しました: {e}"))?;
    Ok(out)
}

/// GStreamerのプラグインレジストリキャッシュディレクトリのパスを計算する（純粋関数）。
/// `$XDG_CACHE_HOME/gstreamer-1.0`、なければ `$HOME/.cache/gstreamer-1.0` を返す。
pub(crate) fn compute_gstreamer_registry_cache_dir(
    xdg_cache_home: Option<&str>,
    home: Option<&str>,
) -> std::path::PathBuf {
    let base = xdg_cache_home
        .map(std::path::PathBuf::from)
        .or_else(|| home.map(|h| std::path::PathBuf::from(h).join(".cache")))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    base.join("gstreamer-1.0")
}

#[cfg(all(desktop, target_os = "linux"))]
fn invalidate_gstreamer_registry_cache() {
    let dir = compute_gstreamer_registry_cache_dir(
        std::env::var("XDG_CACHE_HOME").ok().as_deref(),
        std::env::var("HOME").ok().as_deref(),
    );
    if dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&dir) {
            log::warn!("GStreamerレジストリキャッシュの削除に失敗しました: {e}");
        }
    }
}

/// main ウィンドウ以外からの呼び出しを拒否する（column/popup WebView は x.com を
/// 表示しておりIPCが付与されているため、任意のダウンロードトリガーを防ぐ）。
pub(crate) fn validate_window_label(window_label: &str) -> Result<(), String> {
    if window_label != "main" {
        Err("download_and_enable_h264 is only allowed from the main window".into())
    } else {
        Ok(())
    }
}

/// Cisco公式サーバーからOpenH264バイナリをダウンロードし、SHA256検証・bzip2展開のうえ
/// linux_codec_env::openh264_lib_dir() 配下に配置する。成功時はGStreamerの
/// レジストリキャッシュを削除する（次回起動時の再スキャンを強制するため）。
#[cfg(all(desktop, target_os = "linux"))]
#[tauri::command]
pub async fn download_and_enable_h264(window: tauri::Window) -> Result<(), String> {
    validate_window_label(window.label())?;

    let url = build_download_url(OPENH264_VERSION);
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    verify_sha256(&bytes, OPENH264_SHA256_AMD64)?;
    let decompressed = decompress_bz2(&bytes)?;

    let dir = crate::linux_codec_env::openh264_lib_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join("libopenh264.so.7");
    std::fs::write(&dest, &decompressed).map_err(|e| e.to_string())?;

    invalidate_gstreamer_registry_cache();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== build_download_url のテスト =====

    #[test]
    fn build_download_urlはバージョン文字列をurl内に埋め込む() {
        let result = build_download_url("2.4.1");
        assert_eq!(
            result,
            "http://ciscobinary.openh264.org/libopenh264-2.4.1-linux64.7.so.bz2"
        );
    }

    // ===== verify_sha256 のテスト =====

    #[test]
    fn verify_sha256は正しいsha256を渡すとokを返す() {
        let data = b"hello world";
        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        let result = verify_sha256(data, expected);
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn verify_sha256は誤ったsha256を渡すとerrを返す() {
        let data = b"hello world";
        let wrong_hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let result = verify_sha256(data, wrong_hash);
        assert!(result.is_err());
    }

    #[test]
    fn verify_sha256は大文字hexでも受け入れる() {
        let data = b"hello world";
        let uppercase = "B94D27B9934D3E08A52E52D7DA7DABFAC484EFE37A5380EE9088F7ACE2EFCDE9";
        let result = verify_sha256(data, uppercase);
        assert_eq!(result, Ok(()));
    }

    // ===== decompress_bz2 のテスト =====

    #[test]
    fn decompress_bz2は実際にbzip2圧縮したバイト列を展開して元データと一致することを確認する() {
        use bzip2::write::BzEncoder;
        use std::io::Write;

        let original = b"test data for bzip2 compression";
        let mut encoder = BzEncoder::new(Vec::new(), bzip2::Compression::best());
        encoder.write_all(original).unwrap();
        let compressed = encoder.finish().unwrap();

        let result = decompress_bz2(&compressed);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), original.to_vec());
    }

    #[test]
    fn decompress_bz2は不正なバイト列を渡すとerrを返す() {
        let invalid_data = b"this is not bzip2 data";
        let result = decompress_bz2(invalid_data);
        assert!(result.is_err());
    }

    // ===== compute_gstreamer_registry_cache_dir のテスト =====

    #[test]
    fn compute_gstreamer_registry_cache_dirはxdg_cache_homeが指定されていればそれを優先する() {
        let result =
            compute_gstreamer_registry_cache_dir(Some("/custom/cache"), Some("/home/user"));
        assert_eq!(
            result,
            std::path::PathBuf::from("/custom/cache/gstreamer-1.0")
        );
    }

    #[test]
    fn compute_gstreamer_registry_cache_dirはxdg_cache_homeがnoneでhomeがあればhome_cacheを返す() {
        let result = compute_gstreamer_registry_cache_dir(None, Some("/home/user"));
        assert_eq!(
            result,
            std::path::PathBuf::from("/home/user/.cache/gstreamer-1.0")
        );
    }

    // ===== validate_window_label のテスト =====

    #[test]
    fn validate_window_labelはmainなら_okを返す() {
        let result = validate_window_label("main");
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn validate_window_labelはmain以外なら_errを返す() {
        let result = validate_window_label("column-0");
        assert!(result.is_err());
    }
}

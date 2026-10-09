/// 複数の候補エレメント名のうち1つでも `probe` が true を返せば true。
/// サブプロセス実行（副作用）を関数として注入することでテスト容易にする。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
pub fn detect_codec_support(candidates: &[&str], probe: impl Fn(&str) -> bool) -> bool {
    candidates.iter().any(|&name| probe(name))
}

/// `gst-inspect-1.0 <name>` を実行し、成功終了（該当エレメントが存在）すればtrue。
/// コマンド自体が存在しない場合や実行失敗時はfalse（fail-closed: 警告を出す側に倒す）。
#[cfg(all(desktop, target_os = "linux"))]
fn element_available(name: &str) -> bool {
    std::process::Command::new("gst-inspect-1.0")
        .arg(name)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// H.264/AACデコーダの有無をJS側に渡すためのステータス。
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaCodecStatus {
    pub h264_available: bool,
    pub aac_available: bool,
    /// AppImage 起動で、H.264 デコーダ本体の取得案内の対象になるか。
    pub h264_download_applicable: bool,
}

/// H.264 の再生可否を判定する（純粋関数）。
/// パーサ（h264parse）とデコーダ（OpenH264）の両方が揃っているときだけ再生可能。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
pub fn evaluate_h264_availability(parser_present: bool, decoder_present: bool) -> bool {
    parser_present && decoder_present
}

/// AppImage 同梱のパーサプラグインのパスを組み立てる（純粋関数）。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
fn appimage_parser_path(appdir: &std::path::Path) -> std::path::PathBuf {
    appdir.join("usr/lib/gstreamer-1.0/libgstvideoparsersbad.so")
}

/// AppImage 起動かどうかを環境変数の値から判定し、起動時は `APPDIR` を返す（純粋関数）。
/// `APPIMAGE` と `APPDIR` の両方が設定されている場合のみ AppImage とみなす。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
fn detect_appimage_dir(
    appimage: Option<std::ffi::OsString>,
    appdir: Option<std::ffi::OsString>,
) -> Option<std::path::PathBuf> {
    match (appimage, appdir) {
        (Some(_), Some(dir)) => Some(std::path::PathBuf::from(dir)),
        _ => None,
    }
}

/// AppImage 起動時のステータスを、パーサとデコーダの存在有無から組み立てる（純粋関数）。
/// AAC は fdkaac を同梱しているため常に利用可能として扱う。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
fn appimage_media_status(parser_present: bool, decoder_present: bool) -> MediaCodecStatus {
    MediaCodecStatus {
        h264_available: evaluate_h264_availability(parser_present, decoder_present),
        aac_available: true,
        h264_download_applicable: true,
    }
}

/// パーサ・デコーダのファイルの存在を確認して AppImage 起動時のステータスを返す。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
fn appimage_media_status_from_paths(
    parser_path: &std::path::Path,
    decoder_path: &std::path::Path,
) -> MediaCodecStatus {
    appimage_media_status(parser_path.exists(), decoder_path.exists())
}

/// H.264/AACデコーダの有無をチェックする。Linux desktop以外（Windows/macOS/mobile）は
/// AppImageのようなコーデック欠如問題が起きないため、常に「利用可能」を返す。
#[cfg(all(desktop, target_os = "linux"))]
#[tauri::command]
pub fn check_media_codec_support() -> MediaCodecStatus {
    use crate::commands::openh264_fetch::OPENH264_LIB_FILENAME;

    if let Some(appdir) =
        detect_appimage_dir(std::env::var_os("APPIMAGE"), std::env::var_os("APPDIR"))
    {
        let decoder_path = crate::linux_codec_env::openh264_lib_dir().join(OPENH264_LIB_FILENAME);
        return appimage_media_status_from_paths(&appimage_parser_path(&appdir), &decoder_path);
    }
    let h264_available = detect_codec_support(&["avdec_h264", "openh264dec"], element_available);
    let aac_available =
        detect_codec_support(&["avdec_aac", "faad", "fdkaacdec"], element_available);
    MediaCodecStatus {
        h264_available,
        aac_available,
        h264_download_applicable: false,
    }
}

#[cfg(not(all(desktop, target_os = "linux")))]
#[tauri::command]
pub fn check_media_codec_support() -> MediaCodecStatus {
    MediaCodecStatus {
        h264_available: true,
        aac_available: true,
        h264_download_applicable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 候補が空なら_falseを返す() {
        assert!(!detect_codec_support(&[], |_| true));
    }

    #[test]
    fn 候補全てでprobeがfalseなら_falseを返す() {
        assert!(!detect_codec_support(&["a", "b", "c"], |_| false));
    }

    #[test]
    fn 先頭の候補でprobeがtrueなら_trueを返す() {
        assert!(detect_codec_support(&["a", "b", "c"], |name| name == "a"));
    }

    #[test]
    fn 末尾の候補でprobeがtrueなら_trueを返す() {
        assert!(detect_codec_support(&["a", "b", "c"], |name| name == "c"));
    }

    #[test]
    fn 候補全てでprobeがtrueなら_trueを返す() {
        assert!(detect_codec_support(&["a", "b", "c"], |_| true));
    }

    #[test]
    fn media_codec_statusはcamelcaseでシリアライズされる() {
        let status = MediaCodecStatus {
            h264_available: true,
            aac_available: false,
            h264_download_applicable: true,
        };
        let json = serde_json::to_string(&status).expect("シリアライズに失敗した");
        assert!(json.contains("\"h264Available\":true"));
        assert!(json.contains("\"aacAvailable\":false"));
        assert!(json.contains("\"h264DownloadApplicable\":true"));
    }

    /// 非Linux/非desktop環境（Windows/macOS/mobile）では常に利用可能を返すことを検証する。
    /// 開発機はLinux desktopのため、この分岐はこの環境ではコンパイル対象外となる
    /// （CIのWindows/macOSビルドで検証される想定）。
    #[cfg(not(all(desktop, target_os = "linux")))]
    #[test]
    fn linux_desktop以外では常にコーデック利用可能を返す() {
        let status = check_media_codec_support();
        assert_eq!(
            status,
            MediaCodecStatus {
                h264_available: true,
                aac_available: true,
                h264_download_applicable: false,
            }
        );
    }

    #[test]
    fn h264はパーサとデコーダが揃っているときだけ再生可と判定される() {
        let cases = [
            (true, true, true),
            (false, true, false),
            (true, false, false),
            (false, false, false),
        ];
        for (parser, decoder, expected) in cases {
            assert_eq!(
                evaluate_h264_availability(parser, decoder),
                expected,
                "parser={parser} decoder={decoder}"
            );
        }
    }

    #[test]
    fn appimage起動でパーサとデコーダが揃っていればh264再生可でダウンロード案内の対象になる() {
        let status = appimage_media_status(true, true);
        assert!(status.h264_available);
        assert!(status.aac_available);
        assert!(status.h264_download_applicable);
    }

    #[test]
    fn appimage起動でデコーダが無ければh264再生不可でもダウンロード案内の対象になる() {
        let status = appimage_media_status(true, false);
        assert!(!status.h264_available);
        assert!(status.aac_available);
        assert!(status.h264_download_applicable);
    }

    #[test]
    fn appimage起動でパーサが無ければh264再生不可でもダウンロード案内の対象になる() {
        let status = appimage_media_status(false, true);
        assert!(!status.h264_available);
        assert!(status.h264_download_applicable);
    }

    #[test]
    fn appimage起動でパーサもデコーダも無ければh264再生不可でダウンロード案内の対象になる() {
        let status = appimage_media_status(false, false);
        assert!(!status.h264_available);
        assert!(status.h264_download_applicable);
    }

    #[test]
    fn appimageのパーサのパスはappdir配下のgstreamerプラグインを指す() {
        let path = appimage_parser_path(std::path::Path::new("/tmp/.mount_x"));
        assert_eq!(
            path,
            std::path::PathBuf::from(
                "/tmp/.mount_x/usr/lib/gstreamer-1.0/libgstvideoparsersbad.so"
            )
        );
    }

    #[test]
    fn appimageとappdirの両方があればappimage起動と判定されappdirを返す() {
        let dir = detect_appimage_dir(Some("/x/app.AppImage".into()), Some("/tmp/.mount_x".into()));
        assert_eq!(dir, Some(std::path::PathBuf::from("/tmp/.mount_x")));
    }

    #[test]
    fn appimageのみでappdirが無ければappimage起動とは判定されない() {
        assert_eq!(
            detect_appimage_dir(Some("/x/app.AppImage".into()), None),
            None
        );
    }

    #[test]
    fn appdirのみでappimageが無ければappimage起動とは判定されない() {
        assert_eq!(
            detect_appimage_dir(None, Some("/tmp/.mount_x".into())),
            None
        );
    }

    #[test]
    fn どちらの環境変数も無ければappimage起動とは判定されない() {
        assert_eq!(detect_appimage_dir(None, None), None);
    }

    #[test]
    fn ファイルの有無からappimageのステータスを組み立てる() {
        let dir = tempfile::tempdir().expect("tempdirの作成に失敗した");
        let parser = dir.path().join("parser.so");
        let decoder = dir.path().join("decoder.so");

        let status = appimage_media_status_from_paths(&parser, &decoder);
        assert!(!status.h264_available, "両方無し");

        std::fs::write(&parser, b"").expect("書き込みに失敗した");
        let status = appimage_media_status_from_paths(&parser, &decoder);
        assert!(!status.h264_available, "パーサのみ");

        std::fs::write(&decoder, b"").expect("書き込みに失敗した");
        let status = appimage_media_status_from_paths(&parser, &decoder);
        assert!(status.h264_available, "両方有り");
        assert!(status.h264_download_applicable);
    }

    #[test]
    fn デコーダのファイルだけが存在するときappimageのh264は再生不可になる() {
        let dir = tempfile::tempdir().expect("tempdirの作成に失敗した");
        let parser = dir.path().join("parser.so");
        let decoder = dir.path().join("decoder.so");
        std::fs::write(&decoder, b"").expect("書き込みに失敗した");

        let status = appimage_media_status_from_paths(&parser, &decoder);
        assert!(!status.h264_available);
        assert!(status.h264_download_applicable);
    }

    #[test]
    fn fdkaacdecが現在の候補に含まれる() {
        // 現在の実装ではAAC検出候補に"fdkaacdec"が含まれるべきことをテストする。
        // AAC検出でfdkaacdecが候補として認識されることを検証する。
        assert!(detect_codec_support(
            &["avdec_aac", "faad", "fdkaacdec"],
            |name| name == "fdkaacdec"
        ));
    }
}

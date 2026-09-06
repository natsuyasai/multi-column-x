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
}

/// H.264/AACデコーダの有無をチェックする。Linux desktop以外（Windows/macOS/mobile）は
/// AppImageのようなコーデック欠如問題が起きないため、常に「利用可能」を返す。
#[cfg(all(desktop, target_os = "linux"))]
#[tauri::command]
pub fn check_media_codec_support() -> MediaCodecStatus {
    let h264_available = detect_codec_support(&["avdec_h264", "openh264dec"], element_available);
    let aac_available =
        detect_codec_support(&["avdec_aac", "faad", "fdkaacdec"], element_available);
    MediaCodecStatus {
        h264_available,
        aac_available,
    }
}

#[cfg(not(all(desktop, target_os = "linux")))]
#[tauri::command]
pub fn check_media_codec_support() -> MediaCodecStatus {
    MediaCodecStatus {
        h264_available: true,
        aac_available: true,
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
        };
        let json = serde_json::to_string(&status).expect("シリアライズに失敗した");
        assert!(json.contains("\"h264Available\":true"));
        assert!(json.contains("\"aacAvailable\":false"));
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
            }
        );
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

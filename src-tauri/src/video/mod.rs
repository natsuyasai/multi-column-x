//! 動画ダウンロード機能のコア純粋関数群。
//! desktop/Android で共通のロジック（variant 選定・ファイル名サニタイズ・URL検証）を集約する。
//! ネットワークI/O（HTTP GET・HLS解析）は別モジュールで扱う（このファイルは純粋関数のみ）。
//!
//! `commands::video_download::download_video`（desktop）から呼び出される。

pub mod hls;
pub mod http;

use serde::Deserialize;

/// inject スクリプトから渡される動画 variant 情報（React Fiber解析で取得した `video_info.variants`）。
/// JS→Rust の IPC は camelCase のため `contentType` に `serde(rename)` を付与する。
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct VideoVariantInput {
    #[serde(rename = "contentType")]
    pub content_type: String,
    pub bitrate: Option<u64>,
    pub url: String,
}

const CONTENT_TYPE_MP4: &str = "video/mp4";
const CONTENT_TYPE_HLS: &str = "application/x-mpegURL";

/// variants の中から video/mp4 のうち最も bitrate が高いものを選ぶ。
/// bitrate が None のものは最も低い優先度として扱う。video/mp4 が無ければ None。
pub fn pick_best_mp4_variant(variants: &[VideoVariantInput]) -> Option<&VideoVariantInput> {
    variants
        .iter()
        .filter(|v| v.content_type == CONTENT_TYPE_MP4)
        .max_by_key(|v| v.bitrate)
}

/// variants の中から application/x-mpegURL（HLS master playlist）を選ぶ。
/// 複数ある場合は最初の一つを返す（X の実データでは通常1つ）。無ければ None。
pub fn pick_master_playlist_variant(variants: &[VideoVariantInput]) -> Option<&VideoVariantInput> {
    variants.iter().find(|v| v.content_type == CONTENT_TYPE_HLS)
}

const DEFAULT_FILENAME: &str = "video";
const FORBIDDEN_FILENAME_CHARS: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

/// 保存ファイル名として安全な文字列に変換する。
/// OS のファイルシステムで問題になる文字（/ \ : * ? " < > | や制御文字）を除去し、
/// 先頭末尾の空白・ドットをトリムする。空文字列になった場合はデフォルト名にフォールバックする。
pub fn sanitize_filename(suggested: &str) -> String {
    let filtered: String = suggested
        .chars()
        .filter(|c| !FORBIDDEN_FILENAME_CHARS.contains(c) && !c.is_control())
        .collect();
    let trimmed = filtered.trim_matches(|c: char| c.is_whitespace() || c == '.');
    if trimmed.is_empty() {
        DEFAULT_FILENAME.to_string()
    } else {
        trimmed.to_string()
    }
}

const ALLOWED_VIDEO_HOST: &str = "video.twimg.com";

/// ダウンロード対象URLの検証（SSRF対策）。
/// - https スキームのみ許可
/// - ホストは "video.twimg.com" またはそのサブドメインのみ許可（X の動画CDN）
/// - 上記以外は Err
pub fn validate_variant_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("invalid url: only https scheme is allowed".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "invalid url: missing host".to_string())?;
    if host == ALLOWED_VIDEO_HOST || host.ends_with(&format!(".{ALLOWED_VIDEO_HOST}")) {
        Ok(())
    } else {
        Err(format!("invalid url: host '{host}' is not allowed"))
    }
}

#[cfg(all(test, not(target_os = "android")))]
mod tests {
    use super::*;

    fn mp4(bitrate: Option<u64>, url: &str) -> VideoVariantInput {
        VideoVariantInput {
            content_type: CONTENT_TYPE_MP4.to_string(),
            bitrate,
            url: url.to_string(),
        }
    }

    fn hls(url: &str) -> VideoVariantInput {
        VideoVariantInput {
            content_type: CONTENT_TYPE_HLS.to_string(),
            bitrate: None,
            url: url.to_string(),
        }
    }

    mod pick_best_mp4_variantのテスト {
        use super::*;

        #[test]
        fn 複数bitrateのmp4から最大のものを選ぶ() {
            let variants = vec![
                mp4(Some(256_000), "low.mp4"),
                mp4(Some(2_176_000), "high.mp4"),
                mp4(Some(832_000), "mid.mp4"),
            ];
            let result = pick_best_mp4_variant(&variants);
            assert_eq!(result.map(|v| v.url.as_str()), Some("high.mp4"));
        }

        #[test]
        fn mp4が無くhlsのみならnoneを返す() {
            let variants = vec![hls("master.m3u8")];
            assert_eq!(pick_best_mp4_variant(&variants), None);
        }

        #[test]
        fn bitrateがnoneのものは低優先度として扱われる() {
            let variants = vec![mp4(None, "unknown.mp4"), mp4(Some(1), "known.mp4")];
            let result = pick_best_mp4_variant(&variants);
            assert_eq!(result.map(|v| v.url.as_str()), Some("known.mp4"));
        }

        #[test]
        fn 全てbitrateがnoneならいずれかのmp4を返す() {
            let variants = vec![mp4(None, "a.mp4"), mp4(None, "b.mp4")];
            let result = pick_best_mp4_variant(&variants);
            assert!(result.is_some());
        }

        #[test]
        fn 空配列ならnoneを返す() {
            let variants: Vec<VideoVariantInput> = vec![];
            assert_eq!(pick_best_mp4_variant(&variants), None);
        }

        #[test]
        fn mp4とhls混在ではmp4のみから選ぶ() {
            let variants = vec![hls("master.m3u8"), mp4(Some(500_000), "only.mp4")];
            let result = pick_best_mp4_variant(&variants);
            assert_eq!(result.map(|v| v.url.as_str()), Some("only.mp4"));
        }
    }

    mod pick_master_playlist_variantのテスト {
        use super::*;

        #[test]
        fn application_x_mpegurlがあれば返す() {
            let variants = vec![mp4(Some(500_000), "a.mp4"), hls("master.m3u8")];
            let result = pick_master_playlist_variant(&variants);
            assert_eq!(result.map(|v| v.url.as_str()), Some("master.m3u8"));
        }

        #[test]
        fn 無ければnoneを返す() {
            let variants = vec![mp4(Some(500_000), "a.mp4")];
            assert_eq!(pick_master_playlist_variant(&variants), None);
        }

        #[test]
        fn 複数あれば最初の一つを返す() {
            let variants = vec![hls("first.m3u8"), hls("second.m3u8")];
            let result = pick_master_playlist_variant(&variants);
            assert_eq!(result.map(|v| v.url.as_str()), Some("first.m3u8"));
        }

        #[test]
        fn 空配列ならnoneを返す() {
            let variants: Vec<VideoVariantInput> = vec![];
            assert_eq!(pick_master_playlist_variant(&variants), None);
        }
    }

    mod sanitize_filenameのテスト {
        use super::*;

        #[test]
        fn 危険文字を除去する() {
            let result = sanitize_filename("a/b\\c:d*e?f\"g<h>i|j");
            assert_eq!(result, "abcdefghij");
        }

        #[test]
        fn 空文字列はデフォルト名にフォールバックする() {
            assert_eq!(sanitize_filename(""), "video");
        }

        #[test]
        fn 危険文字のみの文字列はデフォルト名にフォールバックする() {
            assert_eq!(sanitize_filename("/\\:*?\"<>|"), "video");
        }

        #[test]
        fn 通常の日本語と英数字はそのまま保持する() {
            assert_eq!(sanitize_filename("テスト動画_2026"), "テスト動画_2026");
        }

        #[test]
        fn 先頭末尾の空白をトリムする() {
            assert_eq!(sanitize_filename("  video name  "), "video name");
        }

        #[test]
        fn 先頭末尾のドットをトリムする() {
            assert_eq!(sanitize_filename("..video.."), "video");
        }

        #[test]
        fn 制御文字を除去する() {
            assert_eq!(sanitize_filename("a\u{0000}b\u{001f}c"), "abc");
        }

        #[test]
        fn 空白とドットのみの文字列はデフォルト名にフォールバックする() {
            assert_eq!(sanitize_filename("  ...  "), "video");
        }
    }

    mod validate_variant_urlのテスト {
        use super::*;

        #[test]
        fn video_twimg_comは許可する() {
            let result = validate_variant_url(
                "https://video.twimg.com/amplify_video/123/vid/avc1/640x360/x.mp4",
            );
            assert_eq!(result, Ok(()));
        }

        #[test]
        fn httpスキームは拒否する() {
            let result = validate_variant_url("http://video.twimg.com/x.mp4");
            assert!(result.is_err());
        }

        #[test]
        fn ホストになりすましたurlを拒否する() {
            let result = validate_variant_url("https://evil.example.com/video.twimg.com.mp4");
            assert!(result.is_err());
        }

        #[test]
        fn サブドメインを装った偽ホストを拒否する() {
            let result = validate_variant_url("https://video.twimg.com.evil.com/x.mp4");
            assert!(result.is_err());
        }

        #[test]
        fn ユーザー情報を使ったなりすましurlを拒否する() {
            let result = validate_variant_url("https://video.twimg.com@evil.com/x.mp4");
            assert!(result.is_err());
        }

        #[test]
        fn video_twimg_com自体のルートも許可する() {
            let result = validate_variant_url("https://video.twimg.com/");
            assert_eq!(result, Ok(()));
        }

        #[test]
        fn 正当なサブドメインは許可する() {
            let result = validate_variant_url("https://cdn.video.twimg.com/x.mp4");
            assert_eq!(result, Ok(()));
        }

        #[test]
        fn 許可外のホストを拒否する() {
            let result = validate_variant_url("https://pbs.twimg.com/x.mp4");
            assert!(result.is_err());
        }

        #[test]
        fn パース不能な文字列を拒否する() {
            let result = validate_variant_url("not a url");
            assert!(result.is_err());
        }
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// sanitize_filename の出力に危険文字・制御文字が含まれないことを保証する（不変条件）。
            #[test]
            fn 出力に危険文字と制御文字が含まれない(input in ".*") {
                let result = sanitize_filename(&input);
                for c in FORBIDDEN_FILENAME_CHARS {
                    prop_assert!(!result.contains(*c));
                }
                prop_assert!(!result.chars().any(|c| c.is_control()));
            }

            /// sanitize_filename は常に空文字列でない結果を返す（フォールバック保証）。
            #[test]
            fn 常に空文字列でない結果を返す(input in ".*") {
                let result = sanitize_filename(&input);
                prop_assert!(!result.is_empty());
            }

            /// sanitize_filename の出力は先頭末尾に空白・ドットを持たない。
            #[test]
            fn 出力の先頭末尾に空白とドットを持たない(input in ".*") {
                let result = sanitize_filename(&input);
                prop_assert!(!result.starts_with(['.', ' ', '\t', '\n', '\r']));
                prop_assert!(!result.ends_with(['.', ' ', '\t', '\n', '\r']));
            }

            /// validate_variant_url が Ok を返すなら、パースしたホストは必ず許可ホストか
            /// そのサブドメインである（安全側の事後条件）。
            #[test]
            fn okを返すときのホストは常に許可ホスト配下である(url in "https://[a-z]{1,10}\\.video\\.twimg\\.com/[a-z0-9/]{0,20}") {
                let result = validate_variant_url(&url);
                if let Ok(()) = result {
                    let parsed = url::Url::parse(&url).unwrap();
                    let host = parsed.host_str().unwrap();
                    let suffix = format!(".{ALLOWED_VIDEO_HOST}");
                    prop_assert!(host == ALLOWED_VIDEO_HOST || host.ends_with(&suffix));
                }
            }
        }
    }
}

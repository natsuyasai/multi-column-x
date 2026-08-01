//! 動画ダウンロードコマンド。
//! variant 選定ロジック（`plan_download`）は純粋関数として分離しテスト容易性を確保する。
//! 実際の保存ダイアログ・HTTP I/O は `download_video` コマンド本体（`#[cfg(desktop)]`）が担う。

use crate::video::{self, hls, http};

/// variants から実際にダウンロードすべき対象を判定した結果。
/// mp4 progressive があれば単一ファイル、無くHLSのみなら映像/音声の最大2ファイルになる。
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum DownloadPlan {
    /// mp4 progressive を1ファイルとしてダウンロードする。
    SingleMp4 { url: String },
    /// HLSの映像・音声を最大2ファイルとしてダウンロードする（音声トラックが無ければ映像のみ）。
    HlsTracks { master_playlist_url: String },
}

/// variants から DownloadPlan を決定する純粋関数（テスト容易性のため副作用から分離）。
/// mp4 progressive があれば最優先でそれを使う（`video::pick_best_mp4_variant`）。
/// 無ければ HLS master playlist（`video::pick_master_playlist_variant`）を使う。
/// どちらも無ければ Err。
pub(crate) fn plan_download(variants: &[video::VideoVariantInput]) -> Result<DownloadPlan, String> {
    if let Some(mp4) = video::pick_best_mp4_variant(variants) {
        return Ok(DownloadPlan::SingleMp4 {
            url: mp4.url.clone(),
        });
    }
    if let Some(hls) = video::pick_master_playlist_variant(variants) {
        return Ok(DownloadPlan::HlsTracks {
            master_playlist_url: hls.url.clone(),
        });
    }
    Err("no downloadable video variant found".to_string())
}

/// 動画をダウンロードして保存ダイアログでユーザーが選択した場所に保存する。
/// - mp4 progressive があれば1ファイルとして保存する。
/// - mp4が無くHLSのみの場合は映像・音声を別ファイルとして保存する（音声トラックが無ければ映像のみ）。
/// - 各ファイルの保存ダイアログはそれぞれ独立にキャンセル可能（キャンセルはエラーにしない）。
#[cfg(desktop)]
#[tauri::command]
pub async fn download_video(
    app: tauri::AppHandle,
    variants: Vec<video::VideoVariantInput>,
    #[allow(non_snake_case)] suggestedFileName: String,
) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let plan = plan_download(&variants)?;
    let base_name = video::sanitize_filename(&suggestedFileName);

    match plan {
        DownloadPlan::SingleMp4 { url } => {
            // 保存ダイアログを開く前に早期検証する（多重防御。download_to_writer 内部でも検証される）。
            video::validate_variant_url(&url)?;

            let file_path = app
                .dialog()
                .file()
                .set_file_name(format!("{base_name}.mp4"))
                .blocking_save_file();
            let Some(file_path) = file_path else {
                return Ok(()); // キャンセルはエラーにしない
            };
            let path = file_path.into_path().map_err(|e| e.to_string())?;

            let client = http::build_client()?;
            let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
            http::download_to_writer(&client, &url, &mut file).await?;
            Ok(())
        }
        DownloadPlan::HlsTracks {
            master_playlist_url,
        } => {
            video::validate_variant_url(&master_playlist_url)?;
            let client = http::build_client()?;

            let mut master_bytes: Vec<u8> = Vec::new();
            http::download_to_writer(&client, &master_playlist_url, &mut master_bytes).await?;
            let master_text = String::from_utf8(master_bytes)
                .map_err(|e| format!("master playlist is not valid utf-8: {e}"))?;

            let tracks = hls::select_best_tracks(&master_text, &master_playlist_url)?;

            if let Some(file_path) = app
                .dialog()
                .file()
                .set_file_name(format!("{base_name}_video.mp4"))
                .blocking_save_file()
            {
                let path = file_path.into_path().map_err(|e| e.to_string())?;
                let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
                hls::download_track_to_writer(&client, &tracks.video_playlist_url, &mut file)
                    .await?;
            }

            if let Some(audio_url) = tracks.audio_playlist_url {
                if let Some(file_path) = app
                    .dialog()
                    .file()
                    .set_file_name(format!("{base_name}_audio.m4a"))
                    .blocking_save_file()
                {
                    let path = file_path.into_path().map_err(|e| e.to_string())?;
                    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
                    hls::download_track_to_writer(&client, &audio_url, &mut file).await?;
                }
            }

            Ok(())
        }
    }
}

#[cfg(all(test, not(target_os = "android")))]
mod tests {
    use super::*;

    fn mp4(bitrate: Option<u64>, url: &str) -> video::VideoVariantInput {
        video::VideoVariantInput {
            content_type: "video/mp4".to_string(),
            bitrate,
            url: url.to_string(),
        }
    }

    fn hls_variant(url: &str) -> video::VideoVariantInput {
        video::VideoVariantInput {
            content_type: "application/x-mpegURL".to_string(),
            bitrate: None,
            url: url.to_string(),
        }
    }

    mod plan_downloadのテスト {
        use super::*;

        #[test]
        fn mp4_variantがあればsinglemp4を返す() {
            let variants = vec![mp4(Some(832_000), "https://video.twimg.com/a.mp4")];
            let result = plan_download(&variants);
            assert_eq!(
                result,
                Ok(DownloadPlan::SingleMp4 {
                    url: "https://video.twimg.com/a.mp4".to_string()
                })
            );
        }

        #[test]
        fn 複数mp4_variantがあれば最大bitrateのurlを選ぶ() {
            let variants = vec![
                mp4(Some(256_000), "https://video.twimg.com/low.mp4"),
                mp4(Some(2_176_000), "https://video.twimg.com/high.mp4"),
                mp4(Some(832_000), "https://video.twimg.com/mid.mp4"),
            ];
            let result = plan_download(&variants);
            assert_eq!(
                result,
                Ok(DownloadPlan::SingleMp4 {
                    url: "https://video.twimg.com/high.mp4".to_string()
                })
            );
        }

        #[test]
        fn mp4が無くhlsがあればhlstracksを返す() {
            let variants = vec![hls_variant("https://video.twimg.com/master.m3u8")];
            let result = plan_download(&variants);
            assert_eq!(
                result,
                Ok(DownloadPlan::HlsTracks {
                    master_playlist_url: "https://video.twimg.com/master.m3u8".to_string()
                })
            );
        }

        #[test]
        fn mp4とhls両方あればmp4を優先する() {
            let variants = vec![
                hls_variant("https://video.twimg.com/master.m3u8"),
                mp4(Some(500_000), "https://video.twimg.com/only.mp4"),
            ];
            let result = plan_download(&variants);
            assert_eq!(
                result,
                Ok(DownloadPlan::SingleMp4 {
                    url: "https://video.twimg.com/only.mp4".to_string()
                })
            );
        }

        #[test]
        fn どちらも無ければerrを返す() {
            let variants: Vec<video::VideoVariantInput> = vec![];
            let result = plan_download(&variants);
            assert!(result.is_err());
        }

        #[test]
        fn 対応しないcontent_typeのみならerrを返す() {
            let variants = vec![video::VideoVariantInput {
                content_type: "image/jpeg".to_string(),
                bitrate: None,
                url: "https://video.twimg.com/thumb.jpg".to_string(),
            }];
            let result = plan_download(&variants);
            assert!(result.is_err());
        }
    }
}

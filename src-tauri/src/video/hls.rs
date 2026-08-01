//! HLS（HTTP Live Streaming）プレイリスト解析の純粋関数群。
//! master playlist から映像/音声トラックの選定、media playlist からセグメントURL一覧の抽出を行う。
//! ネットワークI/O（実際のGET・セグメント結合）は別モジュールで扱う（このファイルは純粋関数のみ）。
//!
//! 実装計画（tmp/plans/2026-08-01-video-download/plan.md）の作業分割の都合上、
//! 本ファイルはまだ `commands/video_download.rs` から呼び出されていない（後続コミットで配線する）。
//! それまでの間は dead_code 警告を抑止する。
#![allow(dead_code)]

use std::io::Write;

use m3u8_rs::Playlist;

use crate::video::http;

/// 選択された映像/音声トラックのプレイリストURL（絶対URL）のペア。
/// `audio_playlist_url` は AUDIO グループが無い（または対応する EXT-X-MEDIA が無い）
/// master playlist の場合 None になる。
#[derive(Debug, Clone, PartialEq)]
pub struct SelectedTracks {
    pub video_playlist_url: String,
    pub audio_playlist_url: Option<String>,
}

/// media playlist のパース結果。
#[derive(Debug, Clone, PartialEq)]
pub struct MediaSegments {
    pub init_segment_url: Option<String>,
    pub segment_urls: Vec<String>,
}

/// master playlist の生テキストをパースし、最も BANDWIDTH の高い映像トラックと、
/// それに対応する AUDIO グループの音声トラックのプレイリストURLを選ぶ。
/// `base_url` は相対URL解決に使う（master playlist自体のURL）。
/// パース失敗・media playlistが渡された場合・映像トラックが1つも見つからない場合は Err。
pub fn select_best_tracks(
    master_playlist_text: &str,
    base_url: &str,
) -> Result<SelectedTracks, String> {
    let playlist = m3u8_rs::parse_playlist_res(master_playlist_text.as_bytes())
        .map_err(|e| format!("failed to parse master playlist: {e}"))?;
    let master = match playlist {
        Playlist::MasterPlaylist(master) => master,
        Playlist::MediaPlaylist(_) => {
            return Err("expected master playlist but got media playlist".to_string());
        }
    };

    let best_variant = master
        .variants
        .iter()
        .max_by_key(|variant| variant.bandwidth)
        .ok_or_else(|| "master playlist has no variant streams".to_string())?;

    let video_playlist_url = resolve_playlist_url(base_url, &best_variant.uri)?;

    let audio_playlist_url = best_variant
        .audio
        .as_ref()
        .and_then(|group_id| {
            master
                .alternatives
                .iter()
                .find(|alternative| &alternative.group_id == group_id)
        })
        .and_then(|alternative| alternative.uri.as_ref())
        .map(|uri| resolve_playlist_url(base_url, uri))
        .transpose()?;

    Ok(SelectedTracks {
        video_playlist_url,
        audio_playlist_url,
    })
}

/// media playlist（映像 or 音声トラック）の生テキストをパースし、
/// 初期化セグメント（EXT-X-MAP の URI、無い場合は None）と、
/// メディアセグメントURLの一覧（順序通り）を返す。すべて絶対URLに解決する。
/// `base_url` は相対URL解決に使う（media playlist自体のURL）。
pub fn parse_media_segments(
    media_playlist_text: &str,
    base_url: &str,
) -> Result<MediaSegments, String> {
    let playlist = m3u8_rs::parse_playlist_res(media_playlist_text.as_bytes())
        .map_err(|e| format!("failed to parse media playlist: {e}"))?;
    let media = match playlist {
        Playlist::MediaPlaylist(media) => media,
        Playlist::MasterPlaylist(_) => {
            return Err("expected media playlist but got master playlist".to_string());
        }
    };

    // EXT-X-MAP は最初に現れた時点で以降のセグメントに伝播するため、先頭セグメントの map を見れば十分。
    let init_segment_url = media
        .segments
        .first()
        .and_then(|segment| segment.map.as_ref())
        .map(|map| resolve_playlist_url(base_url, &map.uri))
        .transpose()?;

    let segment_urls = media
        .segments
        .iter()
        .map(|segment| resolve_playlist_url(base_url, &segment.uri))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(MediaSegments {
        init_segment_url,
        segment_urls,
    })
}

/// `base_url`（プレイリストのURL）を基準に、プレイリスト内に出てくる相対 or サーバー相対URI (`uri`) を
/// 絶対URLへ解決する。既に絶対URL（"http://" or "https://"始まり）ならそのまま返す。
pub fn resolve_playlist_url(base_url: &str, uri: &str) -> Result<String, String> {
    if uri.starts_with("http://") || uri.starts_with("https://") {
        return Ok(uri.to_string());
    }
    let base = url::Url::parse(base_url).map_err(|e| format!("invalid base url: {e}"))?;
    let resolved = base
        .join(uri)
        .map_err(|e| format!("failed to resolve url: {e}"))?;
    Ok(resolved.to_string())
}

/// `validate` が true なら `crate::video::validate_variant_url` による検証を経てから、
/// false ならSSRF検証を経ずに（テスト専用）、指定URLの内容を `writer` に書き込む。
/// `download_track_to_writer_impl` から呼ばれる内部専用ヘルパーで、
/// 「検証あり／なし」の2経路を1箇所に集約し実装の重複を避ける。
async fn fetch_track_resource<W: Write>(
    client: &reqwest::Client,
    url: &str,
    writer: &mut W,
    validate: bool,
) -> Result<(), String> {
    if validate {
        http::download_to_writer(client, url, writer).await
    } else {
        http::fetch_to_writer_unchecked(client, url, writer).await
    }
}

/// `download_track_to_writer` の実処理本体。`validate` で
/// SSRF検証（`crate::video::validate_variant_url`）を経由するかどうかを切り替える。
/// `validate: false` はテスト専用（wiremockのモックサーバは `video.twimg.com` 以外のホストを
/// 使うため、検証を経由すると常に弾かれてしまうことへの対処）。
async fn download_track_to_writer_impl<W: Write>(
    client: &reqwest::Client,
    media_playlist_url: &str,
    writer: &mut W,
    validate: bool,
) -> Result<(), String> {
    let mut playlist_bytes: Vec<u8> = Vec::new();
    fetch_track_resource(client, media_playlist_url, &mut playlist_bytes, validate).await?;
    let playlist_text = String::from_utf8(playlist_bytes)
        .map_err(|e| format!("media playlist is not valid utf-8: {e}"))?;

    let segments = parse_media_segments(&playlist_text, media_playlist_url)?;

    if let Some(init_url) = &segments.init_segment_url {
        fetch_track_resource(client, init_url, writer, validate).await?;
    }
    for segment_url in &segments.segment_urls {
        fetch_track_resource(client, segment_url, writer, validate).await?;
    }

    Ok(())
}

/// 映像 or 音声の1トラック分をダウンロードする。
/// media playlist（`media_playlist_url`）を取得・パースし（`parse_media_segments` を使う）、
/// init segment（あれば）→ 各media segment の順に取得して `writer` に連結書き込みする。
/// fMP4のHLSは「init segment + 全media segmentsの単純バイナリ連結」で有効な1本の
/// fragmented mp4になる特性を利用する（音声・映像は元々別トラックなので、この関数は
/// どちらか一方のトラックを1ファイルとして書き出すことのみ担当する。2トラックの
/// mux/多重化は本機能のスコープ外）。
/// media playlist自体、および各セグメントURLは `crate::video::validate_variant_url` に
/// よるSSRF検証を経る（呼び出し元がmaster playlistの `select_best_tracks` で得たURLを
/// そのまま渡してくる想定だが、多重防御として本関数内部でも全URLを検証する）。
pub async fn download_track_to_writer<W: Write>(
    client: &reqwest::Client,
    media_playlist_url: &str,
    writer: &mut W,
) -> Result<(), String> {
    download_track_to_writer_impl(client, media_playlist_url, writer, true).await
}

#[cfg(all(test, not(target_os = "android")))]
mod tests {
    use super::*;

    // 実データ（X.comのamplify_video）を一部単純化したフィクスチャ。
    const MASTER_PLAYLIST: &str = "\
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:NAME=\"Audio\",TYPE=AUDIO,GROUP-ID=\"audio-128000\",AUTOSELECT=YES,URI=\"/amplify_video/2083344182551429120/pl/mp4a/128000/nJ25tWYBYCLPds9g.m3u8\"
#EXT-X-MEDIA:NAME=\"Audio\",TYPE=AUDIO,GROUP-ID=\"audio-64000\",AUTOSELECT=YES,URI=\"/amplify_video/2083344182551429120/pl/mp4a/64000/OTFQ-ShBPr7QYwag.m3u8\"
#EXT-X-MEDIA:NAME=\"Audio\",TYPE=AUDIO,GROUP-ID=\"audio-32000\",AUTOSELECT=YES,URI=\"/amplify_video/2083344182551429120/pl/mp4a/32000/2kzumJhpJRs719KL.m3u8\"
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=1920931,BANDWIDTH=2364868,RESOLUTION=720x1280,CODECS=\"mp4a.40.2,avc1.64001F\",AUDIO=\"audio-128000\"
/amplify_video/2083344182551429120/pl/avc1/720x1280/2eM164DNiQkPKOPL.m3u8
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=934208,BANDWIDTH=1116696,RESOLUTION=480x852,CODECS=\"mp4a.40.2,avc1.4D401F\",AUDIO=\"audio-64000\"
/amplify_video/2083344182551429120/pl/avc1/480x852/82qXbytendT_3EyQ.m3u8
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=471040,BANDWIDTH=592517,RESOLUTION=320x568,CODECS=\"mp4a.40.2,avc1.4D401E\",AUDIO=\"audio-32000\"
/amplify_video/2083344182551429120/pl/avc1/320x568/xxx.m3u8
";

    const MASTER_PLAYLIST_BASE_URL: &str =
        "https://video.twimg.com/amplify_video/2083344182551429120/pl/avc1/720x1280/master.m3u8?tag=29";

    const MEDIA_PLAYLIST_VIDEO: &str = "\
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-TARGETDURATION:5
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI=\"/amplify_video/2083344182551429120/vid/avc1/0/0/480x852/X5OyWzxHGJ6gSrR_.mp4\"
#EXTINF:3.000,
/amplify_video/2083344182551429120/vid/avc1/0/3000/480x852/Q_xJWJYpbbuRwyPU.m4s
#EXTINF:3.000,
/amplify_video/2083344182551429120/vid/avc1/3000/6000/480x852/BCUduiK3rMsGYamg.m4s
#EXTINF:3.000,
/amplify_video/2083344182551429120/vid/avc1/6000/9000/480x852/k6UFQ7PBD6kAwfhr.m4s
#EXT-X-ENDLIST
";

    const MEDIA_PLAYLIST_BASE_URL: &str =
        "https://video.twimg.com/amplify_video/2083344182551429120/pl/avc1/480x852/82qXbytendT_3EyQ.m3u8?tag=29";

    mod resolve_playlist_urlのテスト {
        use super::*;

        #[test]
        fn サーバー相対パスをbaseのオリジンで解決する() {
            let result = resolve_playlist_url(
                "https://video.twimg.com/amplify_video/1/pl/master.m3u8",
                "/amplify_video/1/pl/avc1/720x1280/x.m3u8",
            );
            assert_eq!(
                result,
                Ok("https://video.twimg.com/amplify_video/1/pl/avc1/720x1280/x.m3u8".to_string())
            );
        }

        #[test]
        fn 相対パスをbaseのディレクトリ基準で解決する() {
            let result = resolve_playlist_url(
                "https://video.twimg.com/amplify_video/1/pl/master.m3u8",
                "xxx.m3u8",
            );
            assert_eq!(
                result,
                Ok("https://video.twimg.com/amplify_video/1/pl/xxx.m3u8".to_string())
            );
        }

        #[test]
        fn 既に絶対urlならそのまま返す() {
            let result = resolve_playlist_url(
                "https://video.twimg.com/amplify_video/1/pl/master.m3u8",
                "https://video.twimg.com/amplify_video/2/pl/other.m3u8",
            );
            assert_eq!(
                result,
                Ok("https://video.twimg.com/amplify_video/2/pl/other.m3u8".to_string())
            );
        }

        #[test]
        fn baseが不正な場合はエラーになる() {
            let result = resolve_playlist_url("not a url", "/amplify_video/1/x.m3u8");
            assert!(result.is_err());
        }
    }

    mod parse_media_segmentsのテスト {
        use super::*;

        #[test]
        fn init_segmentとsegment一覧を順序通り絶対urlで取得する() {
            let result =
                parse_media_segments(MEDIA_PLAYLIST_VIDEO, MEDIA_PLAYLIST_BASE_URL).unwrap();

            assert_eq!(
                result.init_segment_url,
                Some(
                    "https://video.twimg.com/amplify_video/2083344182551429120/vid/avc1/0/0/480x852/X5OyWzxHGJ6gSrR_.mp4"
                        .to_string()
                )
            );
            assert_eq!(
                result.segment_urls,
                vec![
                    "https://video.twimg.com/amplify_video/2083344182551429120/vid/avc1/0/3000/480x852/Q_xJWJYpbbuRwyPU.m4s".to_string(),
                    "https://video.twimg.com/amplify_video/2083344182551429120/vid/avc1/3000/6000/480x852/BCUduiK3rMsGYamg.m4s".to_string(),
                    "https://video.twimg.com/amplify_video/2083344182551429120/vid/avc1/6000/9000/480x852/k6UFQ7PBD6kAwfhr.m4s".to_string(),
                ]
            );
        }

        #[test]
        fn ext_x_mapが無ければinit_segment_urlはnoneになる() {
            let playlist = "\
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:5
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:3.000,
seg1.ts
#EXT-X-ENDLIST
";
            let result =
                parse_media_segments(playlist, "https://video.twimg.com/a/master.m3u8").unwrap();
            assert_eq!(result.init_segment_url, None);
            assert_eq!(
                result.segment_urls,
                vec!["https://video.twimg.com/a/seg1.ts".to_string()]
            );
        }

        #[test]
        fn 空のmedia_playlistはセグメント無しで成功する() {
            let playlist = "\
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:5
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-ENDLIST
";
            let result =
                parse_media_segments(playlist, "https://video.twimg.com/a/master.m3u8").unwrap();
            assert_eq!(result.init_segment_url, None);
            assert!(result.segment_urls.is_empty());
        }

        #[test]
        fn master_playlistを渡すとエラーになる() {
            let result = parse_media_segments(MASTER_PLAYLIST, MASTER_PLAYLIST_BASE_URL);
            assert!(result.is_err());
        }
    }

    mod select_best_tracksのテスト {
        use super::*;

        #[test]
        fn 最大bandwidthの映像トラックと対応する音声トラックを選ぶ() {
            let result = select_best_tracks(MASTER_PLAYLIST, MASTER_PLAYLIST_BASE_URL).unwrap();

            assert_eq!(
                result.video_playlist_url,
                "https://video.twimg.com/amplify_video/2083344182551429120/pl/avc1/720x1280/2eM164DNiQkPKOPL.m3u8"
            );
            assert_eq!(
                result.audio_playlist_url,
                Some(
                    "https://video.twimg.com/amplify_video/2083344182551429120/pl/mp4a/128000/nJ25tWYBYCLPds9g.m3u8"
                        .to_string()
                )
            );
        }

        #[test]
        fn audioグループの無いmaster_playlistではaudio_playlist_urlがnoneになる() {
            let playlist = "\
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
/video/640x360.m3u8
";
            let result =
                select_best_tracks(playlist, "https://video.twimg.com/a/master.m3u8").unwrap();
            assert_eq!(
                result.video_playlist_url,
                "https://video.twimg.com/video/640x360.m3u8"
            );
            assert_eq!(result.audio_playlist_url, None);
        }

        #[test]
        fn パース不能な文字列はエラーになる() {
            let result = select_best_tracks(
                "not a valid playlist at all",
                "https://video.twimg.com/a/master.m3u8",
            );
            assert!(result.is_err());
        }

        #[test]
        fn 映像トラックが無いmaster_playlistはエラーになる() {
            let playlist = "\
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:NAME=\"Audio\",TYPE=AUDIO,GROUP-ID=\"audio-128000\",AUTOSELECT=YES,URI=\"/audio/128000/audio.m3u8\"
";
            let result = select_best_tracks(playlist, "https://video.twimg.com/a/master.m3u8");
            assert!(result.is_err());
        }

        #[test]
        fn media_playlistを渡すとエラーになる() {
            let result = select_best_tracks(MEDIA_PLAYLIST_VIDEO, MEDIA_PLAYLIST_BASE_URL);
            assert!(result.is_err());
        }
    }

    mod download_track_to_writer_implのテスト {
        use super::*;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        // validate_variant_url は video.twimg.com 系ホストしか許可しないため、
        // wiremock（127.0.0.1）を使う実通信テストは検証を経ない
        // download_track_to_writer_impl(..., validate: false) を直接呼ぶ。

        #[tokio::test]
        async fn init_segmentと複数segmentが順序通り連結されてwriterに書き込まれる() {
            let server = MockServer::start().await;
            let base = server.uri();
            let media_playlist = format!(
                "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:5\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MAP:URI=\"{base}/init.mp4\"\n#EXTINF:3.000,\n{base}/seg1.m4s\n#EXTINF:3.000,\n{base}/seg2.m4s\n#EXT-X-ENDLIST\n"
            );

            Mock::given(method("GET"))
                .and(path("/media.m3u8"))
                .respond_with(ResponseTemplate::new(200).set_body_string(media_playlist))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/init.mp4"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(b"INIT".to_vec()))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/seg1.m4s"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(b"SEG1".to_vec()))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/seg2.m4s"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(b"SEG2".to_vec()))
                .mount(&server)
                .await;

            let client = http::build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let media_url = format!("{base}/media.m3u8");
            let result = download_track_to_writer_impl(&client, &media_url, &mut buf, false).await;

            assert!(result.is_ok());
            assert_eq!(buf, b"INITSEG1SEG2");
        }

        #[tokio::test]
        async fn init_segmentが無いmedia_playlistはsegmentのみ連結される() {
            let server = MockServer::start().await;
            let base = server.uri();
            let media_playlist = format!(
                "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:3.000,\n{base}/seg1.ts\n#EXT-X-ENDLIST\n"
            );

            Mock::given(method("GET"))
                .and(path("/media.m3u8"))
                .respond_with(ResponseTemplate::new(200).set_body_string(media_playlist))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/seg1.ts"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(b"SEG1".to_vec()))
                .mount(&server)
                .await;

            let client = http::build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let media_url = format!("{base}/media.m3u8");
            let result = download_track_to_writer_impl(&client, &media_url, &mut buf, false).await;

            assert!(result.is_ok());
            assert_eq!(buf, b"SEG1");
        }

        #[tokio::test]
        async fn media_playlist自体の取得に失敗するとerrになる() {
            let server = MockServer::start().await;
            let base = server.uri();

            Mock::given(method("GET"))
                .and(path("/missing.m3u8"))
                .respond_with(ResponseTemplate::new(404))
                .mount(&server)
                .await;

            let client = http::build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let media_url = format!("{base}/missing.m3u8");
            let result = download_track_to_writer_impl(&client, &media_url, &mut buf, false).await;

            assert!(result.is_err());
        }

        #[tokio::test]
        async fn segmentの取得に失敗するとerrになる() {
            let server = MockServer::start().await;
            let base = server.uri();
            let media_playlist = format!(
                "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:3.000,\n{base}/missing-seg.ts\n#EXT-X-ENDLIST\n"
            );

            Mock::given(method("GET"))
                .and(path("/media.m3u8"))
                .respond_with(ResponseTemplate::new(200).set_body_string(media_playlist))
                .mount(&server)
                .await;
            Mock::given(method("GET"))
                .and(path("/missing-seg.ts"))
                .respond_with(ResponseTemplate::new(500))
                .mount(&server)
                .await;

            let client = http::build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let media_url = format!("{base}/media.m3u8");
            let result = download_track_to_writer_impl(&client, &media_url, &mut buf, false).await;

            assert!(result.is_err());
        }
    }

    mod download_track_to_writerのテスト {
        use super::*;

        #[tokio::test]
        async fn video_twimg_com以外のmedia_playlist_urlは実通信せずerrになる() {
            let client = http::build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let result =
                download_track_to_writer(&client, "https://evil.example.com/media.m3u8", &mut buf)
                    .await;

            assert!(result.is_err());
            assert!(buf.is_empty());
        }
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// resolve_playlist_url は base が https の場合、常に https:// で始まる絶対URLを返す（不変条件）。
            #[test]
            fn 解決結果は常にhttpsで始まる絶対urlになる(path in "[a-zA-Z0-9/_.-]{1,30}") {
                let base = "https://video.twimg.com/amplify_video/1/pl/master.m3u8";
                let result = resolve_playlist_url(base, &path);
                if let Ok(resolved) = result {
                    prop_assert!(resolved.starts_with("https://"));
                }
            }

            /// 既に絶対URLを渡した場合、resolve_playlist_url はそれをそのまま返す（恒等性）。
            #[test]
            fn 絶対urlはbaseに依存せず恒等である(path in "[a-zA-Z0-9/_.-]{1,20}", base_path in "[a-zA-Z0-9/_.-]{1,20}") {
                let absolute = format!("https://video.twimg.com/{path}");
                let base = format!("https://video.twimg.com/{base_path}");
                let result = resolve_playlist_url(&base, &absolute);
                prop_assert_eq!(result, Ok(absolute));
            }
        }
    }
}

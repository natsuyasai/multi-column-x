//! 動画ダウンロードの HTTP I/O 層（ストリーミング GET）。
//!
//! SSRF対策（`crate::video::validate_variant_url`）を経ない実I/O本体
//! （`fetch_to_writer_unchecked`）と、検証を必ず経由する公開API（`download_to_writer`）に
//! 分離している。理由: テストでは wiremock のモックサーバ（`127.0.0.1`）に対して
//! 実HTTP通信のテストを行いたいが、`validate_variant_url` は `video.twimg.com` 系ホストしか
//! 許可しないため、モックサーバへの通信は検証を経由すると必ず弾かれてしまう。
//! そのため「検証を経ない実I/O」と「検証してから実I/Oを呼ぶ公開API」を分け、
//! 前者はwiremockで実通信ごとテストし、後者は「不正URLなら実通信せずErrになる」ことのみを
//! 軽量にテストする（wiremock不要）。
//!
//! `commands::video_download::download_video`（desktop）から呼び出される。

use std::io::Write;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// 動画ダウンロード用の共通 `reqwest::Client` を構築する。
/// rustls-tls を使用し、接続/リクエスト全体のタイムアウトを設定する。
pub fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))
}

/// URL検証を経ずに、指定URLをGETしてレスポンスボディをストリーミングで `writer` に書き込む。
/// メモリに全体を保持しないよう chunk 単位で書き込む。
/// SSRF対策の検証を経ないため crate 外には公開しない。呼び出し元は必ず検証済みURLのみを渡すこと。
/// `pub(crate)` なのは、`hls::download_track_to_writer` がテスト用の内部ヘルパー
/// （wiremockのモックサーバに対する検証なしダウンロード）から利用するため。
pub(crate) async fn fetch_to_writer_unchecked<W: Write>(
    client: &reqwest::Client,
    url: &str,
    writer: &mut W,
) -> Result<(), String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("http request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("http request failed with status: {status}"));
    }

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("failed to read response body: {e}"))?
    {
        writer
            .write_all(&chunk)
            .map_err(|e| format!("failed to write response chunk: {e}"))?;
    }

    Ok(())
}

/// 指定URLをGETし、レスポンスボディをストリーミングで `writer` に書き込む。
/// ダウンロード前に必ず `crate::video::validate_variant_url` を呼び、検証NGなら
/// 実際のHTTPリクエストを送らずErrを返す（SSRF対策の徹底）。
pub async fn download_to_writer<W: Write>(
    client: &reqwest::Client,
    url: &str,
    writer: &mut W,
) -> Result<(), String> {
    crate::video::validate_variant_url(url)?;
    fetch_to_writer_unchecked(client, url, writer).await
}

#[cfg(all(test, not(target_os = "android")))]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    mod fetch_to_writer_uncheckedのテスト {
        use super::*;

        #[tokio::test]
        async fn ステータス200のボディが正しくwriterに書き込まれる() {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/video.mp4"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(b"hello video".to_vec()))
                .mount(&server)
                .await;

            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let url = format!("{}/video.mp4", server.uri());
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf).await;

            assert!(result.is_ok());
            assert_eq!(buf, b"hello video");
        }

        #[tokio::test]
        async fn ステータス404等のエラーでerrになる() {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/missing.mp4"))
                .respond_with(ResponseTemplate::new(404))
                .mount(&server)
                .await;

            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let url = format!("{}/missing.mp4", server.uri());
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf).await;

            assert!(result.is_err());
        }

        #[tokio::test]
        async fn 空ボディでも成功する() {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/empty.mp4"))
                .respond_with(ResponseTemplate::new(200).set_body_bytes(Vec::<u8>::new()))
                .mount(&server)
                .await;

            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let url = format!("{}/empty.mp4", server.uri());
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf).await;

            assert!(result.is_ok());
            assert!(buf.is_empty());
        }
    }

    mod download_to_writerのテスト {
        use super::*;

        #[tokio::test]
        async fn video_twimg_com以外のurlは実通信せずerrになる() {
            // wiremockサーバは起動せず、不正ホストがvalidate_variant_urlで即座に弾かれることのみ検証する。
            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let result =
                download_to_writer(&client, "https://evil.example.com/video.mp4", &mut buf).await;

            assert!(result.is_err());
            assert!(buf.is_empty());
        }

        #[tokio::test]
        async fn httpスキームは実通信せずerrになる() {
            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let result =
                download_to_writer(&client, "http://video.twimg.com/video.mp4", &mut buf).await;

            assert!(result.is_err());
            assert!(buf.is_empty());
        }
    }
}

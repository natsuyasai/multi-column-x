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

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// 無通信時間の上限（最後にデータを受信してからこの時間内に次のデータが届かなければ打ち切る）。
// リクエスト全体の総時間ではなく、読み取り1回ごとにリセットされる（reqwestのread_timeout）ため、
// 通信が継続している限り大きな動画でも打ち切られない。
const READ_TIMEOUT: Duration = Duration::from_secs(30);

/// ダウンロード進捗のコールバック。呼ばれるたびに (受信済みバイト数, 総バイト数(不明ならNone)) を渡す。
/// 呼び出し側で間引き（`crate::video::should_emit_progress`）を行うため、この関数自体は
/// チャンク受信ごとに毎回呼んでよい。トレイトオブジェクト（`&mut dyn FnMut`）で受け取ることで、
/// ジェネリクスの爆発（コンパイル時間増加・バイナリ肥大化）を避ける。
pub type ProgressCallback<'a> = dyn FnMut(u64, Option<u64>) + Send + 'a;

/// 動画ダウンロード用の共通 `reqwest::Client` を構築する。
/// rustls-tls を使用し、接続タイムアウトと無通信タイムアウト（`read_timeout`）を設定する。
/// リクエスト全体の総時間には上限を設けない（大きな動画のダウンロードが打ち切られないようにするため）。
pub fn build_client() -> Result<reqwest::Client, String> {
    build_client_with(READ_TIMEOUT, CONNECT_TIMEOUT)
}

/// テストのためにタイムアウト値を差し込めるようにした内部関数。
/// `read_timeout` は「最後の読み取りから次の読み取りまでの無通信時間」の上限であり、
/// リクエスト全体の総時間には上限を設けない（`ClientBuilder::timeout` は使わない）。
fn build_client_with(
    read_timeout: Duration,
    connect_timeout: Duration,
) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .read_timeout(read_timeout)
        .connect_timeout(connect_timeout)
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
    on_progress: &mut ProgressCallback<'_>,
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

    let total = response.content_length();
    let mut received: u64 = 0;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("failed to read response body: {e}"))?
    {
        writer
            .write_all(&chunk)
            .map_err(|e| format!("failed to write response chunk: {e}"))?;
        received += chunk.len() as u64;
        on_progress(received, total);
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
    on_progress: &mut ProgressCallback<'_>,
) -> Result<(), String> {
    crate::video::validate_variant_url(url)?;
    fetch_to_writer_unchecked(client, url, writer, on_progress).await
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
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf, &mut |_, _| {}).await;

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
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf, &mut |_, _| {}).await;

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
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf, &mut |_, _| {}).await;

            assert!(result.is_ok());
            assert!(buf.is_empty());
        }

        #[tokio::test]
        async fn 進捗コールバックが累積バイト数とcontent_lengthで呼ばれる() {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/video.mp4"))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_bytes(b"hello video".to_vec())
                        .insert_header("content-length", "11"),
                )
                .mount(&server)
                .await;

            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let url = format!("{}/video.mp4", server.uri());
            let mut calls: Vec<(u64, Option<u64>)> = Vec::new();
            let result =
                fetch_to_writer_unchecked(&client, &url, &mut buf, &mut |received, total| {
                    calls.push((received, total));
                })
                .await;

            assert!(result.is_ok());
            assert!(!calls.is_empty());
            // 最終呼び出し時点で受信済みバイト数はボディ全体のサイズと一致する。
            let (last_received, last_total) = *calls.last().unwrap();
            assert_eq!(last_received, 11);
            assert_eq!(last_total, Some(11));
            // 受信済みバイト数は呼び出しごとに単調増加する。
            for pair in calls.windows(2) {
                assert!(pair[0].0 <= pair[1].0);
            }
        }

        #[tokio::test]
        async fn content_lengthヘッダが無ければ総バイト数はnoneで呼ばれる() {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/chunked.mp4"))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_bytes(b"chunked body".to_vec())
                        .append_header("transfer-encoding", "chunked"),
                )
                .mount(&server)
                .await;

            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let url = format!("{}/chunked.mp4", server.uri());
            let mut calls: Vec<(u64, Option<u64>)> = Vec::new();
            let result =
                fetch_to_writer_unchecked(&client, &url, &mut buf, &mut |received, total| {
                    calls.push((received, total));
                })
                .await;

            assert!(result.is_ok());
            assert!(!calls.is_empty());
            assert!(calls.iter().all(|(_, total)| total.is_none()));
        }
    }

    mod build_client_withのテスト {
        use super::*;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;
        use tokio::time::sleep;

        async fn write_chunk(socket: &mut tokio::net::TcpStream) {
            let chunk = b"AAAAA";
            let frame = format!("{:x}\r\n", chunk.len());
            let _ = socket.write_all(frame.as_bytes()).await;
            let _ = socket.write_all(chunk).await;
            let _ = socket.write_all(b"\r\n").await;
        }

        /// 最小のHTTP/1.1サーバを1本のTCP接続に対して起動し、リクエストを読み捨てたあと
        /// `chunk_count`回、`gap`間隔をあけて5バイトずつのチャンクを送信する（chunked encoding）。
        /// `stall_after_first_chunk`がtrueの場合は最初の1チャンクを送った直後に`stall`だけ停止し、
        /// ターミネータを送らずに接続を開いたままにする（無通信状態の再現）。
        async fn spawn_test_server(
            chunk_count: usize,
            gap: Duration,
            stall_after_first_chunk: Option<Duration>,
        ) -> String {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();

            tokio::spawn(async move {
                let (mut socket, _) = match listener.accept().await {
                    Ok(pair) => pair,
                    Err(_) => return,
                };

                let mut buf = [0u8; 1024];
                loop {
                    match socket.read(&mut buf).await {
                        Ok(0) | Err(_) => return,
                        Ok(n) => {
                            if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") {
                                break;
                            }
                        }
                    }
                }

                let header =
                    b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n";
                if socket.write_all(header).await.is_err() {
                    return;
                }

                if let Some(stall) = stall_after_first_chunk {
                    write_chunk(&mut socket).await;
                    sleep(stall).await;
                    // ターミネータは送らず、接続を開いたままにする（無通信を再現）。
                    return;
                }

                for _ in 0..chunk_count {
                    sleep(gap).await;
                    write_chunk(&mut socket).await;
                }
                let _ = socket.write_all(b"0\r\n\r\n").await;
            });

            format!("http://{addr}")
        }

        #[tokio::test]
        async fn 通信が続いている限り総時間が無通信上限を超えても完了する() {
            // 間隔100ms×15チャンク=約1.5秒（無通信上限1秒を超える）だが、
            // 個々の間隔は無通信上限(1秒)より十分短いため、打ち切られずに完了するはず。
            let gap = Duration::from_millis(100);
            let read_timeout = Duration::from_secs(1);
            let base_url = spawn_test_server(15, gap, None).await;

            let client = build_client_with(read_timeout, Duration::from_secs(1)).unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let url = format!("{base_url}/video.mp4");
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf, &mut |_, _| {}).await;

            assert!(result.is_ok());
            assert_eq!(buf, b"AAAAA".repeat(15));
        }

        #[tokio::test]
        async fn データが届かなくなると無通信上限で失敗する() {
            // 最初の1チャンクの後、無通信上限(1秒)より長い3秒間データが来なければ打ち切られるはず。
            let read_timeout = Duration::from_secs(1);
            let base_url = spawn_test_server(0, Duration::ZERO, Some(Duration::from_secs(3))).await;

            let client = build_client_with(read_timeout, Duration::from_secs(1)).unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let url = format!("{base_url}/video.mp4");
            let result = fetch_to_writer_unchecked(&client, &url, &mut buf, &mut |_, _| {}).await;

            assert!(result.is_err());
        }
    }

    mod download_to_writerのテスト {
        use super::*;

        #[tokio::test]
        async fn video_twimg_com以外のurlは実通信せずerrになる() {
            // wiremockサーバは起動せず、不正ホストがvalidate_variant_urlで即座に弾かれることのみ検証する。
            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let result = download_to_writer(
                &client,
                "https://evil.example.com/video.mp4",
                &mut buf,
                &mut |_, _| {},
            )
            .await;

            assert!(result.is_err());
            assert!(buf.is_empty());
        }

        #[tokio::test]
        async fn httpスキームは実通信せずerrになる() {
            let client = build_client().unwrap();
            let mut buf: Vec<u8> = Vec::new();
            let result = download_to_writer(
                &client,
                "http://video.twimg.com/video.mp4",
                &mut buf,
                &mut |_, _| {},
            )
            .await;

            assert!(result.is_err());
            assert!(buf.is_empty());
        }
    }
}

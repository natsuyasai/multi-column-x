//! OpenH264 ダウンロード専用のHTTPクライアント構築・エラー変換。
//! 呼び出し元の `openh264_fetch` は Linux desktop 限定でコンパイルされるが、
//! `arch_support` と同様にこちらは cfg 制約を持たない別モジュールへ切り出し、
//! Windows でもタイムアウト挙動をテストできるようにする。

use std::time::Duration;

use crate::commands::app_error::{codes, AppError};

/// 接続確立（TCPハンドシェイク）までのタイムアウト。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
pub(crate) const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// 読み取り1回あたりのタイムアウト（無通信状態が続いた場合に発火）。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
pub(crate) const READ_TIMEOUT: Duration = Duration::from_secs(30);

/// 指定したタイムアウトを設定したHTTPクライアントを構築する（純粋関数寄りの組み立て処理）。
/// `read` は無通信状態の検出用、`connect` はTCP接続確立までの上限。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
pub(crate) fn build_client_with(
    read: Duration,
    connect: Duration,
) -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .read_timeout(read)
        .connect_timeout(connect)
        .build()
        .map_err(AppError::internal)
}

/// reqwest のエラーを `AppError` に変換する（純粋関数）。
/// タイムアウト由来のエラーは専用コード、それ以外は生のエラー文字列を持つ内部エラーにする。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
pub(crate) fn map_reqwest_error(e: reqwest::Error) -> AppError {
    if e.is_timeout() {
        AppError::with_detail(codes::H264_DOWNLOAD_TIMEOUT, e)
    } else {
        AppError::internal(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn 応答が無いサーバーへの接続は読み取りタイムアウトでエラーになる() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("リスナーの作成に失敗した");
        let addr = listener.local_addr().expect("アドレス取得に失敗した");

        tokio::spawn(async move {
            if let Ok((_socket, _)) = listener.accept().await {
                // 接続は受け付けるが、応答を返さずソケットを保持し続ける（無応答状態を再現する）。
                std::future::pending::<()>().await;
            }
        });

        let client = build_client_with(Duration::from_millis(200), Duration::from_secs(5))
            .expect("クライアント構築に失敗した");
        let result = client.get(format!("http://{addr}/")).send().await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.is_timeout());
        let mapped = map_reqwest_error(err);
        assert_eq!(mapped.code, codes::H264_DOWNLOAD_TIMEOUT);
        assert!(mapped.detail.is_some());
    }
}

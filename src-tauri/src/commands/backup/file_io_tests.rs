//! ファイル入出力層（`file_io.rs`）と日時・ファイル名整形の単体テスト。
use std::fs;

use super::file_io::{deliver_bridge_result, read_limited, register_bridge_waiter, BridgeResult};
use super::format::{export_file_name, rfc3339_utc, BackupError, MAX_FILE_BYTES};

#[test]
fn 上限ちょうどのファイルは読み込める() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("ok.json");
    fs::write(&path, vec![b' '; MAX_FILE_BYTES]).unwrap();

    let bytes = read_limited(&path).expect("読み込める");

    assert_eq!(bytes.len(), MAX_FILE_BYTES);
}

#[test]
fn 上限を1バイト超えたファイルは中身を読まずに拒否される() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("big.json");
    fs::write(&path, vec![b' '; MAX_FILE_BYTES + 1]).unwrap();

    let result = read_limited(&path);

    assert!(matches!(result, Err(BackupError::TooLarge { .. })));
}

#[test]
fn 存在しないファイルは入出力エラーになる() {
    let tmp = tempfile::tempdir().unwrap();

    let result = read_limited(&tmp.path().join("none.json"));

    assert!(matches!(result, Err(BackupError::Io { .. })));
}

#[test]
fn ブリッジの状態文字列を完了通知に変換する() {
    assert_eq!(BridgeResult::from_bridge("saved", ""), BridgeResult::Saved);
    assert_eq!(
        BridgeResult::from_bridge("picked", ""),
        BridgeResult::Picked
    );
    assert_eq!(
        BridgeResult::from_bridge("cancelled", ""),
        BridgeResult::Cancelled
    );
    assert_eq!(
        BridgeResult::from_bridge("tooLarge", ""),
        BridgeResult::TooLarge
    );
    assert_eq!(
        BridgeResult::from_bridge("error", "原因"),
        BridgeResult::Failed("原因".to_string())
    );
}

#[test]
fn ブリッジの未知の状態文字列は失敗として扱う() {
    assert!(matches!(
        BridgeResult::from_bridge("unexpected", ""),
        BridgeResult::Failed(_)
    ));
}

// 待受は共有の static のため、並行実行で干渉しないよう 1 つのテストで順に確認する。
#[tokio::test]
async fn 完了通知は登録した待受に1回だけ届き新しい登録が古い待受を破棄する() {
    let rx = register_bridge_waiter();
    deliver_bridge_result(BridgeResult::Saved);
    deliver_bridge_result(BridgeResult::Cancelled);
    assert_eq!(rx.await.unwrap(), BridgeResult::Saved);

    let old = register_bridge_waiter();
    let new = register_bridge_waiter();
    deliver_bridge_result(BridgeResult::Picked);
    assert!(old.await.is_err());
    assert_eq!(new.await.unwrap(), BridgeResult::Picked);
}

#[test]
fn エクスポート日時はrfc3339のutcで整形される() {
    assert_eq!(rfc3339_utc(0), "1970-01-01T00:00:00Z");
    assert_eq!(rfc3339_utc(1_700_000_000), "2023-11-14T22:13:20Z");
}

#[test]
fn 既定のファイル名は日付と拡張子を持つ() {
    assert_eq!(
        export_file_name(1_700_000_000),
        "multi-column-x-20231114.mcxbackup.json"
    );
}

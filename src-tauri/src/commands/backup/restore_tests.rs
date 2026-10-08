//! 復元の置換処理（`restore.rs`）の単体テスト。
//! `backup/mod.rs` に `#[cfg(test)] mod restore_tests;` として配線する。
use std::fs;

use serde_json::{json, Value};

use super::format::BackupError;
use super::restore::{apply_with_snapshot, compute_new_settings, RestorePayload};
use crate::commands::settings::AppSettingsData;

fn current_settings() -> AppSettingsData {
    serde_json::from_value(json!({
        "accounts": [
            {
                "id": "acc-1", "label": "既存", "dataDirectory": "/data/acc-1",
                "color": "#1d9bf0", "createdAt": "2026-01-01T00:00:00Z", "xUserId": "111"
            }
        ],
        "columns": [
            {
                "id": "old-1", "accountId": "acc-1", "pageType": "home",
                "width": 350.0, "order": 0, "settings": {}
            }
        ],
        "globalSettings": {
            "theme": "light",
            "windowBounds": { "x": 5.0, "y": 6.0, "width": 700.0, "height": 500.0 },
            "pendingDataDirectoryDeletions": ["/data/pending"]
        }
    }))
    .unwrap()
}

fn column(id: &str, account_id: &str) -> Value {
    json!({
        "id": id, "accountId": account_id, "pageType": "home",
        "width": 350.0, "order": 0, "settings": {}
    })
}

fn external(id: &str, url: &str) -> Value {
    json!({
        "id": id, "accountId": id, "pageType": "external", "customUrl": url,
        "width": 350.0, "order": 0, "settings": {}
    })
}

fn payload(columns: Vec<Value>, global_settings: Value) -> RestorePayload {
    serde_json::from_value(json!({
        "columns": columns,
        "globalSettings": global_settings
    }))
    .unwrap()
}

fn as_json(settings: &AppSettingsData) -> Value {
    serde_json::to_value(settings).unwrap()
}

#[test]
fn 復元後はカラムと設定がバックアップの内容に置き換わる() {
    let result = compute_new_settings(
        &current_settings(),
        payload(vec![column("new-1", "acc-1")], json!({ "theme": "dark" })),
    )
    .expect("置換できる");

    let out = as_json(&result);
    assert_eq!(out["columns"].as_array().unwrap().len(), 1);
    assert_eq!(out["columns"][0]["id"], "new-1");
    assert_eq!(out["globalSettings"]["theme"], "dark");
}

#[test]
fn 復元してもアカウントは置き換わらない() {
    let before = as_json(&current_settings());

    let result = compute_new_settings(
        &current_settings(),
        payload(vec![column("n", "acc-1")], json!({})),
    )
    .unwrap();

    assert_eq!(as_json(&result)["accounts"], before["accounts"]);
}

#[test]
fn ペイロードにウィンドウ位置や削除待ち一覧があっても復元前の値が残る() {
    let result = compute_new_settings(
        &current_settings(),
        payload(
            vec![column("n", "acc-1")],
            json!({
                "windowBounds": { "x": 99.0, "y": 99.0, "width": 1.0, "height": 1.0 },
                "pendingDataDirectoryDeletions": ["/etc"]
            }),
        ),
    )
    .unwrap();

    let out = as_json(&result);
    assert_eq!(out["globalSettings"]["windowBounds"]["x"], 5.0);
    assert_eq!(out["globalSettings"]["windowBounds"]["width"], 700.0);
    assert_eq!(
        out["globalSettings"]["pendingDataDirectoryDeletions"],
        json!(["/data/pending"])
    );
}

#[test]
fn 現在のアカウントに存在しないaccountidを持つカラムは拒否される() {
    let result = compute_new_settings(
        &current_settings(),
        payload(vec![column("n", "unknown-account")], json!({})),
    );

    assert!(matches!(result, Err(BackupError::InvalidField { .. })));
}

#[test]
fn 外部カラムのaccountidが自身のidと異なると拒否される() {
    let mut ext = external("e1", "https://example.com/");
    ext["accountId"] = json!("acc-1");

    let result = compute_new_settings(&current_settings(), payload(vec![ext], json!({})));

    assert!(matches!(result, Err(BackupError::InvalidField { .. })));
}

#[test]
fn 外部カラムのhttp_https以外のurlは拒否される() {
    let result = compute_new_settings(
        &current_settings(),
        payload(vec![external("e1", "javascript:alert(1)")], json!({})),
    );

    assert!(matches!(result, Err(BackupError::InvalidField { .. })));
}

#[test]
fn パス区切りや親ディレクトリ参照を含むカラムidは拒否される() {
    for bad in ["../x", "a/b", "a\\b", ""] {
        let result = compute_new_settings(
            &current_settings(),
            payload(vec![column(bad, "acc-1")], json!({})),
        );

        assert!(
            matches!(result, Err(BackupError::InvalidField { .. })),
            "id={bad:?} は拒否される: {result:?}"
        );
    }
}

#[test]
fn ペイロード内で重複するカラムidは拒否される() {
    let result = compute_new_settings(
        &current_settings(),
        payload(
            vec![column("dup", "acc-1"), column("dup", "acc-1")],
            json!({}),
        ),
    );

    assert!(matches!(result, Err(BackupError::InvalidField { .. })));
}

#[test]
fn カラム数が上限を超えると拒否される() {
    let columns = (0..=super::format::MAX_COLUMNS)
        .map(|i| column(&format!("c{i}"), "acc-1"))
        .collect();

    let result = compute_new_settings(&current_settings(), payload(columns, json!({})));

    assert!(matches!(result, Err(BackupError::LimitExceeded { .. })));
}

#[test]
fn 退避が成功すると現在の設定が退避ファイルに保存され置換結果が返る() {
    let tmp = tempfile::tempdir().unwrap();
    let snapshot_dir = tmp.path().join("restore_snapshots");

    let result = apply_with_snapshot(
        &snapshot_dir,
        1_700_000_000,
        &current_settings(),
        payload(vec![column("new-1", "acc-1")], json!({ "theme": "dark" })),
    )
    .expect("復元できる");

    let entries: Vec<_> = fs::read_dir(&snapshot_dir).unwrap().collect();
    assert_eq!(entries.len(), 1);
    let saved: Value =
        serde_json::from_slice(&fs::read(entries[0].as_ref().unwrap().path()).unwrap()).unwrap();
    assert_eq!(saved, as_json(&current_settings()));
    assert_eq!(as_json(&result)["columns"][0]["id"], "new-1");
}

#[test]
fn 退避に失敗した場合は置換結果を返さない() {
    let tmp = tempfile::tempdir().unwrap();
    let blocked = tmp.path().join("restore_snapshots");
    fs::write(&blocked, b"file").unwrap();

    let result = apply_with_snapshot(
        &blocked,
        1_700_000_000,
        &current_settings(),
        payload(vec![column("new-1", "acc-1")], json!({})),
    );

    assert!(matches!(result, Err(BackupError::Io { .. })));
}

#[test]
fn ペイロードが不正な場合は退避ファイルも作られない() {
    let tmp = tempfile::tempdir().unwrap();
    let snapshot_dir = tmp.path().join("restore_snapshots");

    let result = apply_with_snapshot(
        &snapshot_dir,
        1_700_000_000,
        &current_settings(),
        payload(vec![column("../x", "acc-1")], json!({})),
    );

    assert!(result.is_err());
    assert!(!snapshot_dir.exists() || fs::read_dir(&snapshot_dir).unwrap().next().is_none());
}

#[test]
fn 復元先の既存カラムと同じidを持つカラムは拒否される() {
    let result = compute_new_settings(
        &current_settings(),
        payload(vec![column("old-1", "acc-1")], json!({})),
    );

    assert!(matches!(result, Err(BackupError::InvalidField { .. })));
}

#[test]
fn プリセット内カラムにも安全でないidや重複idは許されない() {
    let preset = |id: &str| {
        json!({
            "presets": [{
                "id": "p1", "name": "p",
                "columns": [column(id, "acc-1")]
            }]
        })
    };

    for bad in ["../x", "a/b", ""] {
        let result = compute_new_settings(
            &current_settings(),
            payload(vec![column("n", "acc-1")], preset(bad)),
        );
        assert!(
            matches!(result, Err(BackupError::InvalidField { .. })),
            "プリセット内 id={bad:?} は拒否される: {result:?}"
        );
    }
    // 本体のカラムと同じ id も拒否される（読み込み時に同じ id になるため）
    let duplicated = compute_new_settings(
        &current_settings(),
        payload(vec![column("n", "acc-1")], preset("n")),
    );
    assert!(matches!(duplicated, Err(BackupError::InvalidField { .. })));
}

#[test]
fn プリセット内カラムも現在のアカウントに存在しない参照は拒否される() {
    let result = compute_new_settings(
        &current_settings(),
        payload(
            vec![column("n", "acc-1")],
            json!({
                "presets": [{
                    "id": "p1", "name": "p",
                    "columns": [column("pc", "unknown-account")]
                }]
            }),
        ),
    );

    assert!(matches!(result, Err(BackupError::InvalidField { .. })));
}

#[test]
fn 既定アカウントは現在のアカウントに存在するものだけを許す() {
    let unknown = compute_new_settings(
        &current_settings(),
        payload(vec![], json!({ "defaultAccountId": "unknown-account" })),
    );
    assert!(matches!(unknown, Err(BackupError::InvalidField { .. })));

    let known = compute_new_settings(
        &current_settings(),
        payload(vec![], json!({ "defaultAccountId": "acc-1" })),
    )
    .expect("存在するアカウントは許可される");
    assert_eq!(
        as_json(&known)["globalSettings"]["defaultAccountId"],
        "acc-1"
    );
}

#[test]
fn プリセットを含む設定が復元される() {
    let result = compute_new_settings(
        &current_settings(),
        payload(
            vec![column("n", "acc-1")],
            json!({
                "presets": [{
                    "id": "p1", "name": "復元プリセット",
                    "columns": [column("pc", "acc-1")]
                }]
            }),
        ),
    )
    .unwrap();

    let out = as_json(&result);
    assert_eq!(
        out["globalSettings"]["presets"][0]["name"],
        "復元プリセット"
    );
    assert_eq!(
        out["globalSettings"]["presets"][0]["columns"][0]["id"],
        "pc"
    );
}

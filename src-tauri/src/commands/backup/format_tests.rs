//! バックアップ形式（`format.rs`）の単体テスト。
//! `backup/mod.rs` に `#[cfg(test)] mod format_tests;` として配線する。
use serde_json::{json, Value};

use super::format::{
    build_export, migrate_to_current, parse_backup, BackupError, BACKUP_FORMAT,
    EXCLUDED_GLOBAL_SETTINGS_KEYS, MAX_COLUMNS, MAX_FILE_BYTES, SCHEMA_VERSION,
};
use crate::commands::settings::{AppSettingsData, GlobalSettingsData};

const FORBIDDEN_KEYS: [&str; 6] = [
    "dataDirectory",
    "createdAt",
    "windowBounds",
    "pendingDataDirectoryDeletions",
    "hardwareVideoDecodeEnabled",
    "h264DownloadPromptDismissed",
];

fn column_json(id: &str, account_id: &str) -> Value {
    json!({ "id": id, "accountId": account_id })
}

fn envelope(columns: Vec<Value>) -> Value {
    json!({
        "format": BACKUP_FORMAT,
        "schemaVersion": SCHEMA_VERSION,
        "appVersion": "1.0.0",
        "exportedAt": "2026-01-01T00:00:00Z",
        "accounts": [
            { "backupAccountId": "A", "label": "アカウントA", "color": "#1d9bf0" }
        ],
        "columns": columns,
        "globalSettings": {}
    })
}

fn parse_value(value: &Value) -> Result<Value, BackupError> {
    let bytes = serde_json::to_vec(value).unwrap();
    parse_backup(&bytes).map(|file| serde_json::to_value(&file).unwrap())
}

fn collect_keys(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                out.push(k.clone());
                collect_keys(v, out);
            }
        }
        Value::Array(items) => items.iter().for_each(|v| collect_keys(v, out)),
        _ => {}
    }
}

fn sample_settings() -> AppSettingsData {
    serde_json::from_value(json!({
        "accounts": [
            {
                "id": "acc-1", "label": "メイン", "dataDirectory": "/secret/acc-1",
                "color": "#1d9bf0", "createdAt": "2026-01-01T00:00:00Z", "xUserId": "111"
            },
            {
                "id": "acc-2", "label": "サブ", "dataDirectory": "/secret/acc-2",
                "color": "#e0245e", "createdAt": "2026-01-02T00:00:00Z"
            }
        ],
        "columns": [
            {
                "id": "col-1", "accountId": "acc-1", "pageType": "home",
                "width": 350.0, "order": 0, "settings": {}
            },
            {
                "id": "col-2", "accountId": "acc-2", "pageType": "notifications",
                "width": 350.0, "order": 1, "settings": {}
            }
        ],
        "globalSettings": {
            "theme": "dark",
            "windowBounds": { "x": 10.0, "y": 20.0, "width": 800.0, "height": 600.0 },
            "pendingDataDirectoryDeletions": ["/secret/old"],
            "hardwareVideoDecodeEnabled": false,
            "h264DownloadPromptDismissed": true,
            "presets": [
                {
                    "id": "p1", "name": "プリセット",
                    "columns": [{
                        "id": "pc-1", "accountId": "acc-1", "pageType": "home",
                        "width": 350.0, "order": 0, "settings": {}
                    }]
                }
            ]
        }
    }))
    .unwrap()
}

#[test]
fn 未知フィールドと欠落フィールドを含む_bom_付きファイルを読み込める() {
    let mut value = envelope(vec![column_json("c1", "A")]);
    value["unknownKey"] = json!("無視される");
    value["columns"][0]["unknownColumnKey"] = json!(1);
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend(serde_json::to_vec(&value).unwrap());

    let parsed = parse_backup(&bytes).expect("検証に成功する");
    let out = serde_json::to_value(&parsed).unwrap();

    assert!(out["accounts"][0]["xUserId"].is_null());
    assert_eq!(out["columns"][0]["pageType"], "home");
    let mut keys = vec![];
    collect_keys(&out, &mut keys);
    assert!(!keys.contains(&"unknownKey".to_string()));
    assert!(!keys.contains(&"unknownColumnKey".to_string()));
}

#[test]
fn 列数を含まない旧バックアップを読み込むと列数は2になる() {
    let mut value = envelope(vec![column_json("c1", "A")]);
    value["globalSettings"] = json!({ "mobileTwoColumnEnabled": true });

    let parsed = parse_value(&value).expect("検証に成功する");

    assert_eq!(parsed["globalSettings"]["mobileColumnCount"], 2);
}

#[test]
fn 壊れたjsonは破損として拒否される() {
    let result = parse_backup(b"{ not json");

    assert!(matches!(result, Err(BackupError::BrokenJson { .. })));
}

#[test]
fn 形式識別子が違うファイルは拒否される() {
    let mut value = envelope(vec![]);
    value["format"] = json!("other-app-backup");

    assert!(matches!(
        parse_value(&value),
        Err(BackupError::FormatMismatch { .. })
    ));
}

#[test]
fn 現行より新しいスキーマバージョンは将来バージョンとして拒否される() {
    let mut value = envelope(vec![]);
    value["schemaVersion"] = json!(SCHEMA_VERSION + 1);

    match parse_value(&value) {
        Err(BackupError::FutureVersion { found, current }) => {
            assert_eq!(found, u64::from(SCHEMA_VERSION) + 1);
            assert_eq!(current, u64::from(SCHEMA_VERSION));
        }
        other => panic!("FutureVersion を期待: {other:?}"),
    }
}

#[test]
fn 数値として不正なスキーマバージョンは将来バージョンではなく拒否される() {
    for raw in ["0", "\"1\"", "1.5", "-1", "null", "18446744073709551616"] {
        let text = format!(
            "{{\"format\":\"{BACKUP_FORMAT}\",\"schemaVersion\":{raw},\"accounts\":[],\"columns\":[]}}"
        );

        let result = parse_backup(text.as_bytes());

        assert!(
            result.is_err() && !matches!(result, Err(BackupError::FutureVersion { .. })),
            "schemaVersion={raw} は形式エラーで拒否される: {result:?}"
        );
    }
}

#[test]
fn サイズ上限をちょうど超えたファイルは中身を見ずに拒否される() {
    let bytes = vec![b' '; MAX_FILE_BYTES + 1];

    assert!(matches!(
        parse_backup(&bytes),
        Err(BackupError::TooLarge { .. })
    ));
}

#[test]
fn サイズ上限ちょうどのファイルは大きさを理由に拒否されない() {
    let mut bytes = serde_json::to_vec(&envelope(vec![])).unwrap();
    bytes.resize(MAX_FILE_BYTES, b' ');

    assert!(parse_backup(&bytes).is_ok());
}

#[test]
fn カラム数が上限を1件超えると拒否される() {
    let columns = (0..=MAX_COLUMNS)
        .map(|i| column_json(&format!("c{i}"), "A"))
        .collect();

    assert!(matches!(
        parse_value(&envelope(columns)),
        Err(BackupError::LimitExceeded { .. })
    ));
}

#[test]
fn カラム数が上限ちょうどなら受理される() {
    let columns = (0..MAX_COLUMNS)
        .map(|i| column_json(&format!("c{i}"), "A"))
        .collect();

    assert!(parse_value(&envelope(columns)).is_ok());
}

#[test]
fn 文字列長の上限を超えるラベルは拒否される() {
    let mut value = envelope(vec![]);
    value["accounts"][0]["label"] = json!("あ".repeat(101));

    assert!(matches!(
        parse_value(&value),
        Err(BackupError::LimitExceeded { .. })
    ));
}

#[test]
fn 外部カラムのhttpsのurlは受理される() {
    let mut column = column_json("e1", "e1");
    column["pageType"] = json!("external");
    column["customUrl"] = json!("https://example.com/");

    assert!(parse_value(&envelope(vec![column])).is_ok());
}

#[test]
fn 外部カラムとカスタムカラムのhttp_https以外のurlは拒否される() {
    for page_type in ["external", "custom"] {
        for url in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,x",
            "ftp://example.com/",
            "not a url",
        ] {
            let mut column = column_json("e1", "e1");
            column["pageType"] = json!(page_type);
            column["customUrl"] = json!(url);

            let result = parse_value(&envelope(vec![column]));

            assert!(
                matches!(result, Err(BackupError::InvalidField { .. })),
                "{page_type} の {url} は拒否される: {result:?}"
            );
        }
    }
}

#[test]
fn ファイルに含まれる端末依存項目は取り込まれない() {
    let mut value = envelope(vec![column_json("c1", "A")]);
    value["accounts"][0]["dataDirectory"] = json!("/etc");
    value["accounts"][0]["createdAt"] = json!("2020-01-01T00:00:00Z");
    value["globalSettings"] = json!({
        "theme": "dark",
        "windowBounds": { "x": 1.0, "y": 1.0, "width": 1.0, "height": 1.0 },
        "pendingDataDirectoryDeletions": ["/etc"],
        "hardwareVideoDecodeEnabled": false,
        "h264DownloadPromptDismissed": true
    });

    let out = parse_value(&value).expect("受理される");

    let mut keys = vec![];
    collect_keys(&out, &mut keys);
    for forbidden in FORBIDDEN_KEYS {
        assert!(
            !keys.contains(&forbidden.to_string()),
            "{forbidden} が結果に残っている"
        );
    }
    assert_eq!(out["globalSettings"]["theme"], "dark");
}

#[test]
fn スキーマバージョン1の移行は内容を変えない() {
    let value = envelope(vec![column_json("c1", "A")]);

    let migrated = migrate_to_current(value.clone(), 1).expect("移行できる");

    assert_eq!(migrated, value);
}

#[test]
fn エクスポートの全体構造にエンベロープとスキーマバージョンが入る() {
    let file = build_export(&sample_settings(), "1.2.3", "2026-05-06T07:08:09Z");
    let out = serde_json::to_value(&file).unwrap();

    assert_eq!(out["format"], BACKUP_FORMAT);
    assert_eq!(out["schemaVersion"], SCHEMA_VERSION);
    assert_eq!(out["appVersion"], "1.2.3");
    assert_eq!(out["exportedAt"], "2026-05-06T07:08:09Z");
    assert_eq!(out["columns"].as_array().unwrap().len(), 2);
    assert_eq!(
        out["globalSettings"]["presets"].as_array().unwrap().len(),
        1
    );
}

#[test]
fn エクスポートのアカウントはバックアップ用id_ラベル_色_xユーザーidだけを持つ() {
    let file = build_export(&sample_settings(), "1.0.0", "2026-01-01T00:00:00Z");
    let out = serde_json::to_value(&file).unwrap();

    let mut first: Vec<String> = out["accounts"][0]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    first.sort();
    assert_eq!(first, vec!["backupAccountId", "color", "label", "xUserId"]);
    assert_eq!(out["accounts"][0]["xUserId"], "111");

    let second = out["accounts"][1].as_object().unwrap();
    assert!(second
        .keys()
        .all(|k| ["backupAccountId", "color", "label", "xUserId"].contains(&k.as_str())));
}

#[test]
fn エクスポートに端末依存項目とパスが含まれない() {
    let file = build_export(&sample_settings(), "1.0.0", "2026-01-01T00:00:00Z");
    let text = serde_json::to_string(&file).unwrap();
    let out: Value = serde_json::from_str(&text).unwrap();

    let mut keys = vec![];
    collect_keys(&out, &mut keys);
    for forbidden in FORBIDDEN_KEYS {
        assert!(
            !keys.contains(&forbidden.to_string()),
            "{forbidden} が出力に含まれる"
        );
    }
    assert!(!text.contains("/secret/"));
    assert!(!text.to_lowercase().contains("cookie"));
}

#[test]
fn 追加した2つの設定はバックアップに含まれない() {
    let settings = sample_settings();
    assert!(!settings.global_settings.hardware_video_decode_enabled);
    assert!(settings.global_settings.h264_download_prompt_dismissed);

    let file = build_export(&settings, "1.0.0", "2026-01-01T00:00:00Z");
    let out: Value = serde_json::to_value(&file).unwrap();

    let global = out["globalSettings"].as_object().unwrap();
    assert!(!global.contains_key("hardwareVideoDecodeEnabled"));
    assert!(!global.contains_key("h264DownloadPromptDismissed"));
}

#[test]
fn アプリuiの表示サイズはバックアップに含まれない() {
    let mut settings = sample_settings();
    settings.global_settings.ui_scale = "xLarge".to_string();

    let file = build_export(&settings, "1.0.0", "2026-01-01T00:00:00Z");
    let out: Value = serde_json::to_value(&file).unwrap();

    let global = out["globalSettings"].as_object().unwrap();
    assert!(!global.contains_key("uiScale"));
}

#[test]
fn エクスポートのglobalsettingsキーは既定値のキー集合から除外リストを引いたものと一致する() {
    let default_keys: std::collections::BTreeSet<String> =
        serde_json::to_value(GlobalSettingsData::default())
            .unwrap()
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
    let excluded: std::collections::BTreeSet<String> = EXCLUDED_GLOBAL_SETTINGS_KEYS
        .iter()
        .map(|k| k.to_string())
        .collect();

    let file = build_export(&sample_settings(), "1.0.0", "2026-01-01T00:00:00Z");
    let exported_keys: std::collections::BTreeSet<String> = serde_json::to_value(&file).unwrap()
        ["globalSettings"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();

    assert!(excluded.is_subset(&default_keys));
    assert!(exported_keys.is_disjoint(&excluded));
    let union: std::collections::BTreeSet<String> =
        exported_keys.union(&excluded).cloned().collect();
    assert_eq!(union, default_keys);
}

#[test]
fn エクスポートしたファイルはそのまま読み込める() {
    let file = build_export(&sample_settings(), "1.0.0", "2026-01-01T00:00:00Z");
    let bytes = serde_json::to_vec_pretty(&file).unwrap();

    let parsed = parse_backup(&bytes).expect("往復できる");

    assert_eq!(
        serde_json::to_value(&parsed).unwrap(),
        serde_json::to_value(&file).unwrap()
    );
}

mod properties {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn 任意のスキーマバージョンでもパニックしない(raw in "[-0-9.eE\"a-z]{0,24}") {
            let text = format!(
                "{{\"format\":\"{BACKUP_FORMAT}\",\"schemaVersion\":{raw},\"accounts\":[],\"columns\":[]}}"
            );
            let _ = parse_backup(text.as_bytes());
        }

        #[test]
        fn 任意のバイト列でもパニックしない(bytes in proptest::collection::vec(any::<u8>(), 0..512)) {
            let _ = parse_backup(&bytes);
        }
    }
}

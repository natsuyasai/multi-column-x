//! 復元直前の自動退避（`snapshot.rs`）の単体テスト。
//! `backup/mod.rs` に `#[cfg(test)] mod snapshot_tests;` として配線する。
use std::fs;

use super::snapshot::{write_snapshot, SNAPSHOT_KEEP};

fn file_names(dir: &std::path::Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    names
}

#[test]
fn 退避ファイルはタイムスタンプ付きの名前で内容がそのまま保存される() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("restore_snapshots");

    let path = write_snapshot(&dir, 0, b"{\"a\":1}").expect("退避できる");

    assert_eq!(
        path.file_name().unwrap().to_string_lossy(),
        "appsettings-19700101-000000.json"
    );
    assert_eq!(fs::read(&path).unwrap(), b"{\"a\":1}");
}

#[test]
fn 退避先ディレクトリが無ければ作成される() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("nested").join("restore_snapshots");

    write_snapshot(&dir, 1_000, b"x").expect("退避できる");

    assert!(dir.is_dir());
}

#[test]
fn 同じ秒に2回退避しても既存の退避を上書きしない() {
    let tmp = tempfile::tempdir().unwrap();

    let first = write_snapshot(tmp.path(), 5_000, b"first").unwrap();
    let second = write_snapshot(tmp.path(), 5_000, b"second").unwrap();

    assert_ne!(first, second);
    assert_eq!(fs::read(&first).unwrap(), b"first");
    assert_eq!(fs::read(&second).unwrap(), b"second");
}

#[test]
fn 保持世代数を超えると古い退避から削除され直前の退避は残る() {
    let tmp = tempfile::tempdir().unwrap();
    let mut written = vec![];
    for i in 0..(SNAPSHOT_KEEP + 2) {
        let path = write_snapshot(tmp.path(), 1_000_000 + (i as u64) * 10, b"x").unwrap();
        written.push(path);
    }

    let remaining = file_names(tmp.path());

    assert_eq!(remaining.len(), SNAPSHOT_KEEP);
    assert!(written.last().unwrap().exists(), "直前に書いた退避は残る");
    assert!(!written[0].exists(), "最も古い退避は削除される");
    assert!(!written[1].exists());
}

#[test]
fn 接頭辞が一致しないファイルは世代整理で削除されない() {
    let tmp = tempfile::tempdir().unwrap();
    fs::write(
        tmp.path().join("settings.json.20200101-000000.bak"),
        b"keep",
    )
    .unwrap();
    fs::write(tmp.path().join("memo.txt"), b"keep").unwrap();

    for i in 0..(SNAPSHOT_KEEP + 3) {
        write_snapshot(tmp.path(), 2_000_000 + (i as u64) * 10, b"x").unwrap();
    }

    assert!(tmp
        .path()
        .join("settings.json.20200101-000000.bak")
        .exists());
    assert!(tmp.path().join("memo.txt").exists());
}

#[test]
fn 退避先がファイルで塞がれている場合はエラーを返す() {
    let tmp = tempfile::tempdir().unwrap();
    let blocked = tmp.path().join("restore_snapshots");
    fs::write(&blocked, b"file").unwrap();

    assert!(write_snapshot(&blocked, 1_000, b"x").is_err());
}

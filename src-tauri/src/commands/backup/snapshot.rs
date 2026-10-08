//! 復元直前の自動退避。タイムスタンプ付きの専用ファイルに書き、世代数を制限する。
//!
//! 破損復旧用の `settings.json.*.bak` / `settings.json.prev` とは名前空間を共有しない
//! （世代削除が互いのファイルを消さないようにするため）。

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::commands::settings::utc_datetime_parts;

/// 退避ファイル名の接頭辞。
const SNAPSHOT_PREFIX: &str = "appsettings-";
const SNAPSHOT_EXTENSION: &str = ".json";
/// 保持する退避の世代数。
pub const SNAPSHOT_KEEP: usize = 5;
/// 同一秒の衝突を避けるための連番の最大試行数。
const MAX_SAME_SECOND: u32 = 1000;

fn snapshot_stem(unix_secs: u64) -> String {
    let (year, month, day, hour, minute, second) = utc_datetime_parts(unix_secs);
    format!("{SNAPSHOT_PREFIX}{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}")
}

/// 退避ファイル名を (タイムスタンプ文字列, 同一秒内の連番) に分解する。
/// `appsettings-YYYYMMDD-HHMMSS[-n].json` 以外は None（削除対象にしない）。
fn parse_snapshot_name(name: &str) -> Option<(String, u32)> {
    let stem = name
        .strip_prefix(SNAPSHOT_PREFIX)?
        .strip_suffix(SNAPSHOT_EXTENSION)?;
    let mut parts = stem.split('-');
    let date = parts.next()?;
    let time = parts.next()?;
    let serial = match parts.next() {
        Some(n) => n.parse::<u32>().ok()?,
        None => 0,
    };
    if parts.next().is_some() {
        return None;
    }
    let all_digits = |s: &str, len: usize| s.len() == len && s.bytes().all(|b| b.is_ascii_digit());
    (all_digits(date, 8) && all_digits(time, 6)).then(|| (format!("{date}-{time}"), serial))
}

/// 現在の設定を退避ファイルとして書き込み、そのパスを返す。
/// 既存の退避は上書きしない（同一秒なら連番を付ける）。書き込み後に古い世代を削除するが、
/// 直前に書いた退避は削除しない。
pub fn write_snapshot(dir: &Path, unix_secs: u64, bytes: &[u8]) -> io::Result<PathBuf> {
    fs::create_dir_all(dir)?;
    let stem = snapshot_stem(unix_secs);

    let mut written = None;
    for n in 0..MAX_SAME_SECOND {
        let name = if n == 0 {
            format!("{stem}{SNAPSHOT_EXTENSION}")
        } else {
            format!("{stem}-{n}{SNAPSHOT_EXTENSION}")
        };
        let path = dir.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if let Err(e) = file.write_all(bytes).and_then(|()| file.sync_all()) {
                    // 中途半端なファイルを残さない。
                    let _ = fs::remove_file(&path);
                    return Err(e);
                }
                written = Some(path);
                break;
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    let path = written.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::AlreadyExists,
            "同一秒内の退避ファイル名が使い切られました",
        )
    })?;

    prune_snapshots(dir, &path);
    Ok(path)
}

/// 保持世代数を超えた古い退避を削除する。失敗しても復元は止めない（ログのみ）。
fn prune_snapshots(dir: &Path, keep_path: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut snapshots: Vec<((String, u32), PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|e| {
            let key = parse_snapshot_name(&e.file_name().to_string_lossy())?;
            Some((key, e.path()))
        })
        .collect();
    snapshots.sort_by(|a, b| a.0.cmp(&b.0));

    let excess = snapshots.len().saturating_sub(SNAPSHOT_KEEP);
    for (_, path) in snapshots
        .into_iter()
        .filter(|(_, p)| p != keep_path)
        .take(excess)
    {
        if let Err(e) = fs::remove_file(&path) {
            log::warn!("古い復元前退避の削除に失敗しました: {e}");
        }
    }
}

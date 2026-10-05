//! settings.json の破損耐性（アトミック書き込み・起動時の検査と復旧）。
// 配線（lib.rs / settings.rs）は後続コミットで行うため、それまで未使用警告を抑止する。
#![allow(dead_code)]

use std::{fs, io, path::Path};

pub(crate) const SETTINGS_FILE: &str = "settings.json";
pub(crate) const PREV_FILE: &str = "settings.json.prev";
const TMP_FILE: &str = "settings.json.tmp";

/// JSON としてパースでき、トップレベルがオブジェクトなら true。
fn is_valid_settings_bytes(bytes: &[u8]) -> bool {
    matches!(
        serde_json::from_slice::<serde_json::Value>(bytes),
        Ok(serde_json::Value::Object(_))
    )
}

/// 一時ファイルに write_fn で書き込み → sync_all → rename で path を置換する。
/// write_fn が Err を返したら一時ファイルを削除して Err を返し、path は変更しない。
pub(crate) fn atomic_write_with<F>(path: &Path, write_fn: F) -> io::Result<()>
where
    F: FnOnce(&mut fs::File) -> io::Result<()>,
{
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let tmp_path = parent.join(TMP_FILE);
    let result = (|| {
        let mut file = fs::File::create(&tmp_path)?;
        write_fn(&mut file)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp_path, path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp_path);
        return Err(e);
    }
    sync_parent_dir(parent);
    Ok(())
}

/// 親ディレクトリを fsync する（unix のみ。失敗しても保存は成功扱い）。
#[cfg(unix)]
fn sync_parent_dir(parent: &Path) {
    if let Err(e) = fs::File::open(parent).and_then(|dir| dir.sync_all()) {
        log::warn!("設定ディレクトリの fsync に失敗しました: {e}");
    }
}

#[cfg(not(unix))]
fn sync_parent_dir(_parent: &Path) {}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    use io::Write;
    atomic_write_with(path, |file| file.write_all(bytes))
}

/// main が正常なら prev へコピー（失敗は log::warn! のみで保存は継続）→ main をアトミックに置換。
pub(crate) fn write_settings_atomically(dir: &Path, bytes: &[u8]) -> io::Result<()> {
    let main = dir.join(SETTINGS_FILE);
    if fs::read(&main).is_ok_and(|b| is_valid_settings_bytes(&b)) {
        if let Err(e) = fs::copy(&main, dir.join(PREV_FILE)) {
            log::warn!("設定の直前世代の保存に失敗しました: {e}");
        }
    }
    atomic_write(&main, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn 書き込みが途中で失敗しても元の設定ファイルは変わらない() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        fs::write(&path, b"{\"a\":1}").unwrap();

        let result = atomic_write_with(&path, |file| {
            file.write_all(b"{\"a\":")?;
            Err(io::Error::other("中断"))
        });

        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"{\"a\":1}");
        assert!(!dir.path().join(TMP_FILE).exists());
    }

    #[test]
    fn 保存すると新しい内容が読み込める() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"{\"a\":1}").unwrap();

        write_settings_atomically(dir.path(), b"{\"a\":2}").unwrap();

        let read = fs::read(dir.path().join(SETTINGS_FILE)).unwrap();
        assert_eq!(read, b"{\"a\":2}");
        assert!(is_valid_settings_bytes(&read));
    }

    #[test]
    fn 保存が成功したあと一時ファイルが残らない() {
        let dir = tempfile::tempdir().unwrap();

        write_settings_atomically(dir.path(), b"{}").unwrap();

        assert!(dir.path().join(SETTINGS_FILE).exists());
        assert!(!dir.path().join(TMP_FILE).exists());
    }

    #[test]
    fn 正常なjsonオブジェクトだけが有効と判定される() {
        assert!(is_valid_settings_bytes(b"{}"));
        assert!(!is_valid_settings_bytes(b""));
        assert!(!is_valid_settings_bytes(b"{\"a\":"));
        assert!(!is_valid_settings_bytes(b"[1]"));
    }

    #[test]
    fn 保存すると直前の内容がprevに残る() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"{\"a\":1}").unwrap();

        write_settings_atomically(dir.path(), b"{\"a\":2}").unwrap();

        assert_eq!(fs::read(dir.path().join(PREV_FILE)).unwrap(), b"{\"a\":1}");
    }

    #[test]
    fn 壊れた設定ファイルは直前世代を上書きしない() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(PREV_FILE), b"{\"a\":0}").unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"{\"a\":").unwrap();

        write_settings_atomically(dir.path(), b"{\"a\":2}").unwrap();

        assert_eq!(fs::read(dir.path().join(PREV_FILE)).unwrap(), b"{\"a\":0}");
    }
}

#[cfg(test)]
mod properties {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn 任意のバイト列で有効判定がpanicしない(bytes in proptest::collection::vec(any::<u8>(), 0..256)) {
            let _ = is_valid_settings_bytes(&bytes);
        }

        #[test]
        fn アトミック書き込みした内容は常に読み戻せる(bytes in proptest::collection::vec(any::<u8>(), 0..256)) {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join(SETTINGS_FILE);
            atomic_write(&path, &bytes).unwrap();
            prop_assert_eq!(fs::read(&path).unwrap(), bytes);
        }
    }
}

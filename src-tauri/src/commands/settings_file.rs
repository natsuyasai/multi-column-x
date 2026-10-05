//! settings.json の破損耐性（アトミック書き込み・起動時の検査と復旧）。
// 配線（lib.rs / settings.rs）は後続コミットで行うため、それまで未使用警告を抑止する。
#![allow(dead_code)]

use std::{fs, io, path::Path, sync::Mutex};

pub(crate) const SETTINGS_FILE: &str = "settings.json";
pub(crate) const PREV_FILE: &str = "settings.json.prev";
const TMP_FILE: &str = "settings.json.tmp";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SettingsRecovery {
    Healthy,
    Restored,
    Unrecoverable { backup_path: Option<String> },
}

pub(crate) struct SettingsRecoveryState(pub Mutex<Option<SettingsRecovery>>);

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

/// 起動時に settings.json を検査し、壊れていれば退避して直前世代から復元する。
pub(crate) fn recover_settings_file(dir: &Path, unix_secs: u64) -> SettingsRecovery {
    let main = dir.join(SETTINGS_FILE);
    let main_bytes = match fs::read(&main) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return SettingsRecovery::Healthy,
        Err(e) => {
            log::error!("設定ファイルの読み込みに失敗しました: {e}");
            Vec::new()
        }
    };
    if is_valid_settings_bytes(&main_bytes) {
        return SettingsRecovery::Healthy;
    }

    let backup_path = backup_broken_file(dir, &main, unix_secs);
    let prev = dir.join(PREV_FILE);
    let prev_valid = fs::read(&prev).is_ok_and(|b| is_valid_settings_bytes(&b));
    if prev_valid {
        match fs::copy(&prev, &main) {
            Ok(_) => return SettingsRecovery::Restored,
            Err(e) => log::error!("直前世代からの設定の復元に失敗しました: {e}"),
        }
    }
    SettingsRecovery::Unrecoverable { backup_path }
}

/// 壊れた main を dir 配下へ退避する。失敗しても起動は継続するため None を返しログに出す。
fn backup_broken_file(dir: &Path, main: &Path, unix_secs: u64) -> Option<String> {
    let backup = dir.join(crate::commands::settings::backup_file_name(unix_secs));
    match fs::copy(main, &backup) {
        Ok(_) => Some(backup.to_string_lossy().to_string()),
        Err(e) => {
            log::error!("壊れた設定ファイルの退避に失敗しました: {e}");
            None
        }
    }
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

    const SECS: u64 = 1_700_000_000;

    fn backup_path_of(dir: &Path) -> std::path::PathBuf {
        dir.join(crate::commands::settings::backup_file_name(SECS))
    }

    #[test]
    fn 保存すると新しい内容が次回起動時に正常として扱われる() {
        let dir = tempfile::tempdir().unwrap();
        write_settings_atomically(dir.path(), b"{\"a\":1}").unwrap();

        assert_eq!(
            recover_settings_file(dir.path(), SECS),
            SettingsRecovery::Healthy
        );
        assert_eq!(
            fs::read(dir.path().join(SETTINGS_FILE)).unwrap(),
            b"{\"a\":1}"
        );
    }

    #[test]
    fn 空の設定ファイルは退避され復旧不能として報告される() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"").unwrap();

        let result = recover_settings_file(dir.path(), SECS);

        let backup = backup_path_of(dir.path());
        assert_eq!(
            result,
            SettingsRecovery::Unrecoverable {
                backup_path: Some(backup.to_string_lossy().to_string())
            }
        );
        assert!(backup.exists());
    }

    #[test]
    fn 途中で切れたjsonの設定ファイルは退避され復旧不能として報告される() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"{\"appSettings\":{\"acc").unwrap();

        let result = recover_settings_file(dir.path(), SECS);

        assert!(matches!(
            result,
            SettingsRecovery::Unrecoverable {
                backup_path: Some(_)
            }
        ));
        assert_eq!(
            fs::read(backup_path_of(dir.path())).unwrap(),
            b"{\"appSettings\":{\"acc"
        );
    }

    #[test]
    fn 直前世代も壊れているときは復旧不能として報告される() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"").unwrap();
        fs::write(dir.path().join(PREV_FILE), b"{").unwrap();

        assert!(matches!(
            recover_settings_file(dir.path(), SECS),
            SettingsRecovery::Unrecoverable { .. }
        ));
    }

    #[test]
    fn 設定ファイルが無いときは何もせず正常として扱う() {
        let dir = tempfile::tempdir().unwrap();

        let result = recover_settings_file(dir.path(), SECS);

        assert_eq!(result, SettingsRecovery::Healthy);
        assert!(!dir.path().join(SETTINGS_FILE).exists());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn 壊れた設定ファイルは直前の世代から復元される() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"{\"a\":").unwrap();
        fs::write(dir.path().join(PREV_FILE), b"{\"a\":1}").unwrap();

        let result = recover_settings_file(dir.path(), SECS);

        assert_eq!(result, SettingsRecovery::Restored);
        assert_eq!(
            fs::read(dir.path().join(SETTINGS_FILE)).unwrap(),
            b"{\"a\":1}"
        );
        assert_eq!(fs::read(backup_path_of(dir.path())).unwrap(), b"{\"a\":");
    }

    #[test]
    fn 正常な設定ファイルは退避も復元もされない() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), b"{\"a\":2}").unwrap();
        fs::write(dir.path().join(PREV_FILE), b"{\"a\":1}").unwrap();

        assert_eq!(
            recover_settings_file(dir.path(), SECS),
            SettingsRecovery::Healthy
        );
        assert_eq!(
            fs::read(dir.path().join(SETTINGS_FILE)).unwrap(),
            b"{\"a\":2}"
        );
        assert!(!backup_path_of(dir.path()).exists());
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

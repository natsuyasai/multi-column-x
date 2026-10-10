//! 拡張フォルダ直下の予約名エントリの検出と、除外コピーの作成（OS 非依存）。
//!
//! WebView2 の AddBrowserExtension は、拡張フォルダ直下に `_locales` / `_metadata` 以外の
//! `_` 始まりのエントリがあると `E_ACCESSDENIED` で拒否する。サブフォルダ内の `_` 始まりは問題ない。
//! そのため該当エントリだけを除いたコピーを作って読み込む。元フォルダは一切変更しない。
//! シンボリックリンクはコピーせずスキップする（コピー先でリンク先を辿らないため）。
// 後続ステップ（コマンド・reconcile）で使用するまで未使用の項目がある。
#![allow(dead_code)]

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// 直下にあっても許容される `_` 始まりのエントリ名。
const ALLOWED_UNDERSCORE_ENTRIES: [&str; 2] = ["_locales", "_metadata"];

/// 読み込みに使うフォルダ。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedDir {
    pub path: PathBuf,
    /// サニタイズコピーを作成したか（false なら元フォルダそのまま）。
    pub copied: bool,
}

fn is_reserved_name(name: &str) -> bool {
    name.starts_with('_') && !ALLOWED_UNDERSCORE_ENTRIES.contains(&name)
}

/// 直下の「`_locales` `_metadata` 以外で `_` 始まり」のエントリ名一覧（ソート済み）。
pub fn find_reserved_entries(dir: &Path) -> io::Result<Vec<String>> {
    let mut names: Vec<String> = fs::read_dir(dir)?
        .collect::<io::Result<Vec<_>>>()?
        .into_iter()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|name| is_reserved_name(name))
        .collect();
    names.sort();
    Ok(names)
}

/// 予約名エントリがあり、サニタイズが必要か。
pub fn needs_sanitize(dir: &Path) -> io::Result<bool> {
    Ok(!find_reserved_entries(dir)?.is_empty())
}

/// `entry_id` を検証してコピー先ディレクトリを返す。英数字・`-`・`_` のみ許可する
/// （`..` や区切り文字によるパストラバーサルを防ぐ）。
fn sanitized_copy_dir(copy_root: &Path, entry_id: &str) -> io::Result<PathBuf> {
    let valid = !entry_id.is_empty()
        && entry_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "entry_id に使用できない文字が含まれています",
        ));
    }
    Ok(copy_root.join(entry_id))
}

/// `src` を `dst` へ再帰コピーする。`skip_reserved_top` が true のとき直下の予約名だけ除外する。
/// シンボリックリンクはスキップする。
fn copy_dir(src: &Path, dst: &Path, skip_reserved_top: bool) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        if skip_reserved_top && name.to_str().is_some_and(is_reserved_name) {
            continue;
        }
        let target = dst.join(&name);
        if file_type.is_dir() {
            copy_dir(&entry.path(), &target, false)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// 予約名が無ければ `source` をそのまま返す。あれば `copy_root/<entry_id>/` を作り直し、
/// 直下の予約名エントリだけを除いたコピーのパスを返す。元フォルダは変更しない。
pub fn prepare_extension_dir(
    source: &Path,
    copy_root: &Path,
    entry_id: &str,
) -> io::Result<PreparedDir> {
    let dest = sanitized_copy_dir(copy_root, entry_id)?;
    if !needs_sanitize(source)? {
        return Ok(PreparedDir {
            path: source.to_path_buf(),
            copied: false,
        });
    }
    if dest.exists() {
        fs::remove_dir_all(&dest)?;
    }
    copy_dir(source, &dest, true)?;
    Ok(PreparedDir {
        path: dest,
        copied: true,
    })
}

/// サニタイズコピーだけを削除する（存在しなくても Ok）。元フォルダには触れない。
pub fn remove_sanitized_copy(copy_root: &Path, entry_id: &str) -> io::Result<()> {
    let dest = sanitized_copy_dir(copy_root, entry_id)?;
    match fs::remove_dir_all(&dest) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write(path: &Path, body: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }

    /// 元フォルダ（予約名ファイル `_bad.txt` あり）とコピー先ルートを用意する。
    fn setup() -> (TempDir, PathBuf, PathBuf) {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("src_ext");
        write(&source.join("manifest.json"), "{}");
        write(&source.join("_bad.txt"), "bad");
        let copy_root = tmp.path().join("extensions");
        (tmp, source, copy_root)
    }

    fn snapshot(dir: &Path) -> Vec<(String, Option<String>)> {
        let mut out = Vec::new();
        fn walk(base: &Path, dir: &Path, out: &mut Vec<(String, Option<String>)>) {
            for e in fs::read_dir(dir).unwrap().flatten() {
                let p = e.path();
                let rel = p
                    .strip_prefix(base)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                if p.is_dir() {
                    out.push((rel, None));
                    walk(base, &p, out);
                } else {
                    out.push((rel, Some(fs::read_to_string(&p).unwrap())));
                }
            }
        }
        walk(dir, dir, &mut out);
        out.sort();
        out
    }

    #[test]
    fn 予約名のファイルを含むフォルダは除外したコピーから追加される() {
        let (_tmp, source, copy_root) = setup();
        let before = snapshot(&source);

        let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert!(prepared.copied);
        assert_eq!(prepared.path, copy_root.join("id-1"));
        assert!(prepared.path.join("manifest.json").is_file());
        assert!(!prepared.path.join("_bad.txt").exists());
        // 元のフォルダの内容は変更されない
        assert_eq!(snapshot(&source), before);
    }

    #[test]
    fn フォルダ指定で追加した拡張機能を削除しても元のフォルダは残る() {
        let (_tmp, source, copy_root) = setup();
        let before = snapshot(&source);
        let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        remove_sanitized_copy(&copy_root, "id-1").unwrap();

        assert!(!prepared.path.exists());
        assert_eq!(snapshot(&source), before);
    }

    #[test]
    fn locales_と_metadata_は除外されず残る() {
        let (_tmp, source, copy_root) = setup();
        write(&source.join("_locales/ja/messages.json"), "{}");
        write(&source.join("_metadata/verified_contents.json"), "{}");

        let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert!(prepared.path.join("_locales/ja/messages.json").is_file());
        assert!(prepared
            .path
            .join("_metadata/verified_contents.json")
            .is_file());
    }

    #[test]
    fn サブフォルダ内のアンダースコア始まりは残る() {
        let (_tmp, source, copy_root) = setup();
        write(&source.join("lib/_x.js"), "x");

        let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert!(prepared.path.join("lib/_x.js").is_file());
    }

    #[test]
    fn 直下のファイル_空ディレクトリ_中身ありディレクトリが全て除外される() {
        let (_tmp, source, copy_root) = setup();
        write(&source.join("_x.txt"), "x");
        fs::create_dir_all(source.join("_emptydir")).unwrap();
        write(&source.join("_other/inner.txt"), "i");

        let reserved = find_reserved_entries(&source).unwrap();
        assert_eq!(reserved, vec!["_bad.txt", "_emptydir", "_other", "_x.txt"]);

        let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();
        for name in &reserved {
            assert!(!prepared.path.join(name).exists(), "{name} が残っている");
        }
        assert!(prepared.path.join("manifest.json").is_file());
        assert!(source.join("_other/inner.txt").is_file());
    }

    #[test]
    fn 再実行でコピーが置換され古いファイルが残らない() {
        let (_tmp, source, copy_root) = setup();
        write(&source.join("old.js"), "old");
        let first = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();
        assert!(first.path.join("old.js").is_file());

        fs::remove_file(source.join("old.js")).unwrap();
        write(&source.join("new.js"), "new");
        let second = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert!(!second.path.join("old.js").exists());
        assert!(second.path.join("new.js").is_file());
    }

    #[test]
    fn entry_id_に親ディレクトリ参照や区切り文字を含むとエラーになる() {
        let (tmp, source, copy_root) = setup();
        for bad in ["..", "../evil", "a/b", "a\\b", "", "."] {
            let err = prepare_extension_dir(&source, &copy_root, bad).unwrap_err();
            assert_eq!(err.kind(), io::ErrorKind::InvalidInput, "{bad:?}");
            let err = remove_sanitized_copy(&copy_root, bad).unwrap_err();
            assert_eq!(err.kind(), io::ErrorKind::InvalidInput, "{bad:?}");
        }
        assert!(!tmp.path().join("evil").exists());
    }

    #[test]
    fn 予約名が無ければ元パスのままでコピーを作らない() {
        let tmp = TempDir::new().unwrap();
        let source = tmp.path().join("clean");
        write(&source.join("manifest.json"), "{}");
        write(&source.join("_locales/en/messages.json"), "{}");
        let copy_root = tmp.path().join("extensions");

        let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert_eq!(
            prepared,
            PreparedDir {
                path: source.clone(),
                copied: false
            }
        );
        assert!(!copy_root.exists());
        assert!(!needs_sanitize(&source).unwrap());
    }

    #[test]
    fn コピーが存在しない場合の削除は成功する() {
        let tmp = TempDir::new().unwrap();
        assert!(remove_sanitized_copy(&tmp.path().join("none"), "id-1").is_ok());
    }
}

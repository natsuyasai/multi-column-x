//! 拡張フォルダ直下の予約名エントリの検出と、除外コピーの作成（OS 非依存）。
//!
//! WebView2 の AddBrowserExtension は、拡張フォルダ直下に `_locales` / `_metadata` 以外の
//! `_` 始まりのエントリがあると `E_ACCESSDENIED` で拒否する。サブフォルダ内の `_` 始まりは問題ない。
//! そのため該当エントリだけを除いたコピーを作って読み込む。元フォルダは一切変更しない。
//! シンボリックリンクはコピーせずスキップする（コピー先でリンク先を辿らないため）。

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

/// 比較用にパスを正規化する（存在する祖先までを `canonicalize`、`\\?\` 除去、`/` 区切り、小文字化）。
fn normalize_for_compare(path: &Path) -> String {
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    let mut current = path.to_path_buf();
    let resolved = loop {
        if let Ok(real) = fs::canonicalize(&current) {
            break rest.iter().rev().fold(real, |acc, part| acc.join(part));
        }
        match (
            current.file_name().map(|n| n.to_os_string()),
            current.parent(),
        ) {
            (Some(name), Some(parent)) => {
                rest.push(name);
                current = parent.to_path_buf();
            }
            _ => break path.to_path_buf(),
        }
    };
    let text = resolved.to_string_lossy().to_lowercase().replace('\\', "/");
    let text = text.strip_prefix("//?/").unwrap_or(&text);
    text.trim_end_matches('/').to_string()
}

/// `child` が `parent` 自身またはその子孫か。
fn is_inside(parent: &Path, child: &Path) -> bool {
    let parent = normalize_for_compare(parent);
    let child = normalize_for_compare(child);
    child == parent || child.starts_with(&format!("{parent}/"))
}

fn too_large_error() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        "拡張機能のフォルダが大きすぎます",
    )
}

/// 指紋の保存先（`copy_root/<entry_id>.fingerprint`）。コピー先フォルダの外に置く。
fn fingerprint_path(copy_root: &Path, entry_id: &str) -> PathBuf {
    copy_root.join(format!("{entry_id}.fingerprint"))
}

/// FNV-1a 64bit。実装やバージョンに依存しない安定したハッシュ。
fn fnv1a64(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

struct Scan {
    lines: Vec<String>,
    files: usize,
    bytes: u64,
}

fn scan_dir(
    base: &Path,
    dir: &Path,
    depth: usize,
    skip_reserved_top: bool,
    limits: &ScanLimits,
    scan: &mut Scan,
) -> io::Result<()> {
    if depth > limits.max_depth {
        return Err(too_large_error());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        if skip_reserved_top && name.to_str().is_some_and(is_reserved_name) {
            continue;
        }
        let path = entry.path();
        let rel = path
            .strip_prefix(base)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        if file_type.is_dir() {
            scan.lines.push(format!("d\t{rel}"));
            scan_dir(base, &path, depth + 1, false, limits, scan)?;
        } else {
            let meta = entry.metadata()?;
            scan.files += 1;
            scan.bytes = scan.bytes.saturating_add(meta.len());
            if scan.files > limits.max_files || scan.bytes > limits.max_total_bytes {
                return Err(too_large_error());
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_nanos());
            scan.lines
                .push(format!("f\t{rel}\t{}\t{modified}", meta.len()));
        }
    }
    Ok(())
}

/// コピー対象の内容から決定的な指紋を作る（コピー元の絶対パス + 相対パス・サイズ・更新時刻）。
/// 合計ファイル数・サイズ・深さが上限を超えるとエラーにする。
fn compute_fingerprint(source: &Path, limits: &ScanLimits) -> io::Result<String> {
    let mut scan = Scan {
        lines: Vec::new(),
        files: 0,
        bytes: 0,
    };
    scan_dir(source, source, 1, true, limits, &mut scan)?;
    scan.lines.sort();
    let text = format!("{}\n{}", source.to_string_lossy(), scan.lines.join("\n"));
    Ok(format!("{:016x}-{}", fnv1a64(&text), text.len()))
}

/// 走査・コピーの上限。
#[derive(Debug, Clone, Copy)]
pub struct ScanLimits {
    pub max_files: usize,
    pub max_total_bytes: u64,
    pub max_depth: usize,
}

/// 予約名が無ければ `source` をそのまま返す。あれば `copy_root/<entry_id>/` を作り直し、
/// 直下の予約名エントリだけを除いたコピーのパスを返す。元フォルダは変更しない。
pub fn prepare_extension_dir(
    source: &Path,
    copy_root: &Path,
    entry_id: &str,
) -> io::Result<PreparedDir> {
    prepare_extension_dir_with_limits(
        source,
        copy_root,
        entry_id,
        &ScanLimits {
            max_files: 20_000,
            max_total_bytes: 500 * 1024 * 1024,
            max_depth: 32,
        },
    )
}

/// `prepare_extension_dir` の上限指定版。
pub fn prepare_extension_dir_with_limits(
    source: &Path,
    copy_root: &Path,
    entry_id: &str,
    limits: &ScanLimits,
) -> io::Result<PreparedDir> {
    let dest = sanitized_copy_dir(copy_root, entry_id)?;
    if !needs_sanitize(source)? {
        return Ok(PreparedDir {
            path: source.to_path_buf(),
            copied: false,
        });
    }
    if is_inside(source, copy_root) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "コピー先が拡張機能のフォルダの内側にあります",
        ));
    }
    let fingerprint = compute_fingerprint(source, limits)?;
    let fingerprint_file = fingerprint_path(copy_root, entry_id);
    // 内容が変わっていなければ再コピーしない（読み込み中のフォルダを壊さない）。
    if dest.is_dir()
        && fs::read_to_string(&fingerprint_file).is_ok_and(|saved| saved == fingerprint)
    {
        return Ok(PreparedDir {
            path: dest,
            copied: true,
        });
    }
    // 途中で失敗したコピーを有効と見なさないよう、先に指紋を消す。
    remove_if_exists(&fingerprint_file)?;
    if dest.exists() {
        fs::remove_dir_all(&dest)?;
    }
    copy_dir(source, &dest, true)?;
    fs::write(&fingerprint_file, &fingerprint)?;
    Ok(PreparedDir {
        path: dest,
        copied: true,
    })
}

fn remove_if_exists(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

/// サニタイズコピーだけを削除する（存在しなくても Ok）。元フォルダには触れない。
pub fn remove_sanitized_copy(copy_root: &Path, entry_id: &str) -> io::Result<()> {
    let dest = sanitized_copy_dir(copy_root, entry_id)?;
    remove_if_exists(&fingerprint_path(copy_root, entry_id))?;
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

    fn 小さな上限() -> ScanLimits {
        ScanLimits {
            max_files: 3,
            max_total_bytes: 1000,
            max_depth: 2,
        }
    }

    #[test]
    fn 指紋が一致するときは再コピーせず同じコピーを返す() {
        let (_tmp, source, copy_root) = setup();
        let first = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();
        // コピー先に目印を置く（再コピーされると消える）
        write(&first.path.join("marker.txt"), "keep");

        let second = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert!(second.copied);
        assert_eq!(second.path, first.path);
        assert!(second.path.join("marker.txt").is_file());
        assert!(copy_root.join("id-1.fingerprint").is_file());
    }

    #[test]
    fn 元ファイルを変更すると再コピーされる() {
        let (_tmp, source, copy_root) = setup();
        let first = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();
        write(&first.path.join("marker.txt"), "keep");

        write(&source.join("manifest.json"), "{\"changed\": true}");
        let second = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert!(!second.path.join("marker.txt").exists());
        assert_eq!(
            fs::read_to_string(second.path.join("manifest.json")).unwrap(),
            "{\"changed\": true}"
        );
    }

    #[test]
    fn コピー先が消えていて指紋だけ残っていても再コピーされる() {
        let (_tmp, source, copy_root) = setup();
        let first = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();
        fs::remove_dir_all(&first.path).unwrap();

        let second = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        assert!(second.path.join("manifest.json").is_file());
    }

    #[test]
    fn 削除すると指紋ファイルも消える() {
        let (_tmp, source, copy_root) = setup();
        prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

        remove_sanitized_copy(&copy_root, "id-1").unwrap();

        assert!(!copy_root.join("id-1.fingerprint").exists());
    }

    #[test]
    fn ファイル数が上限を超えるとエラーになる() {
        let (_tmp, source, copy_root) = setup();
        for i in 0..4 {
            write(&source.join(format!("f{i}.js")), "x");
        }

        let err = prepare_extension_dir_with_limits(&source, &copy_root, "id-1", &小さな上限())
            .unwrap_err();

        assert!(err.to_string().contains("拡張機能のフォルダが大きすぎます"));
        assert!(!copy_root.join("id-1").exists());
    }

    #[test]
    fn 合計サイズが上限を超えるとエラーになる() {
        let (_tmp, source, copy_root) = setup();
        write(&source.join("big.bin"), &"x".repeat(2000));

        let err = prepare_extension_dir_with_limits(&source, &copy_root, "id-1", &小さな上限())
            .unwrap_err();

        assert!(err.to_string().contains("拡張機能のフォルダが大きすぎます"));
    }

    #[test]
    fn 深さが上限を超えるとエラーになる() {
        let (_tmp, source, copy_root) = setup();
        write(&source.join("a/b/c/d.js"), "x");

        let err = prepare_extension_dir_with_limits(&source, &copy_root, "id-1", &小さな上限())
            .unwrap_err();

        assert!(err.to_string().contains("拡張機能のフォルダが大きすぎます"));
    }

    #[test]
    fn 上限ちょうどならコピーできる() {
        let (_tmp, source, copy_root) = setup();
        write(&source.join("a/b.js"), "x");

        let prepared =
            prepare_extension_dir_with_limits(&source, &copy_root, "id-1", &小さな上限()).unwrap();

        assert!(prepared.path.join("a/b.js").is_file());
    }

    #[test]
    fn コピー先が元フォルダの内側にあるとエラーになり何もコピーしない() {
        let (_tmp, source, _copy_root) = setup();
        let inside = source.join("copies");

        let err = prepare_extension_dir(&source, &inside, "id-1").unwrap_err();

        assert_eq!(err.kind(), io::ErrorKind::InvalidInput);
        assert!(!inside.join("id-1").exists());
    }

    #[test]
    fn コピー先が元フォルダの内側かの比較は大文字小文字を区別しない() {
        let (_tmp, source, _copy_root) = setup();
        let upper = PathBuf::from(source.to_string_lossy().to_uppercase()).join("copies");

        assert!(is_inside(&source, &upper));
        assert!(!is_inside(&source, &source.with_file_name("src_ext_other")));
    }

    mod properties {
        use std::collections::BTreeSet;

        use super::*;
        use proptest::prelude::*;

        /// 直下のエントリ（名前, ディレクトリか）。名前は小文字のみで衝突・Windows 予約名を避ける。
        /// `_` 始まり（許容名 `_locales` `_metadata` を含む）と非 `_` 始まりを混ぜる。
        fn 直下のエントリ() -> impl Strategy<Value = Vec<(String, bool)>> {
            let name = prop_oneof![
                "[a-z0-9_-]{0,8}".prop_map(|s| format!("_{s}")),
                "[a-z0-9_-]{0,8}".prop_map(|s| format!("f{s}")),
                Just("_locales".to_string()),
                Just("_metadata".to_string()),
            ];
            prop::collection::vec((name, any::<bool>()), 0..8).prop_map(|v| {
                let mut seen = BTreeSet::new();
                v.into_iter()
                    .filter(|(n, _)| seen.insert(n.clone()))
                    .collect()
            })
        }

        fn 偽フォルダを作る(entries: &[(String, bool)]) -> (TempDir, PathBuf, PathBuf) {
            let tmp = TempDir::new().unwrap();
            let source = tmp.path().join("src_ext");
            fs::create_dir_all(&source).unwrap();
            for (name, is_dir) in entries {
                if *is_dir {
                    write(&source.join(name).join("_inner.txt"), name);
                } else {
                    write(&source.join(name), name);
                }
            }
            let copy_root = tmp.path().join("extensions");
            (tmp, source, copy_root)
        }

        fn 予約名か(name: &str) -> bool {
            name.starts_with('_') && name != "_locales" && name != "_metadata"
        }

        proptest! {
            #![proptest_config(ProptestConfig::with_cases(32))]

            #[test]
            fn 元フォルダの内容は処理の前後で変わらない(entries in 直下のエントリ()) {
                let (_tmp, source, copy_root) = 偽フォルダを作る(&entries);
                let before = snapshot(&source);

                prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

                prop_assert_eq!(snapshot(&source), before);
            }

            #[test]
            fn コピーの直下には予約名が残らず予約名以外は全て残る(entries in 直下のエントリ()) {
                let (_tmp, source, copy_root) = 偽フォルダを作る(&entries);

                let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

                if prepared.copied {
                    let names: Vec<String> = fs::read_dir(&prepared.path)
                        .unwrap()
                        .map(|e| e.unwrap().file_name().into_string().unwrap())
                        .collect();
                    prop_assert!(names.iter().all(|n| !予約名か(n)), "予約名が残っている: {:?}", names);
                    for (name, _) in entries.iter().filter(|(n, _)| !予約名か(n)) {
                        prop_assert!(names.contains(name), "{} が失われた", name);
                    }
                }
            }

            #[test]
            fn 予約名が無いときだけコピーが作られ有るときは必ず作られる(entries in 直下のエントリ()) {
                let (_tmp, source, copy_root) = 偽フォルダを作る(&entries);
                let reserved = find_reserved_entries(&source).unwrap();

                let prepared = prepare_extension_dir(&source, &copy_root, "id-1").unwrap();

                prop_assert_eq!(prepared.copied, !reserved.is_empty());
                if reserved.is_empty() {
                    prop_assert_eq!(prepared.path, source);
                    prop_assert!(!copy_root.exists());
                }
            }
        }
    }
}

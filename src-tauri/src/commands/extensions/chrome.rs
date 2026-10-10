//! Chrome にインストール済みの拡張機能の検出（OS 非依存の純粋ロジック）。
//! 実環境のパス取得（`LOCALAPPDATA`）だけを `chrome_extensions_root_from_env` に分離している。

use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::manifest::read_manifest_info;

/// 対象とする Chrome プロファイル（現状は Default のみ）。
pub const DEFAULT_PROFILE: &str = "Default";

/// 検出された拡張機能 1 件。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DetectedExtension {
    #[serde(rename = "chromeId")]
    pub chrome_id: String,
    pub profile: String,
    pub name: String,
    /// 最新バージョンのフォルダ（実パス）。
    pub path: String,
    #[serde(rename = "hasPopup")]
    pub has_popup: bool,
    #[serde(rename = "hasOptions")]
    pub has_options: bool,
    /// 既にアプリへ追加済みか。
    pub added: bool,
}

/// 検出結果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectOutcome {
    pub chrome_found: bool,
    pub items: Vec<DetectedExtension>,
}

/// `<local_app_data>\Google\Chrome\User Data\<profile>\Extensions`
pub fn chrome_extensions_root(local_app_data: &Path, profile: &str) -> PathBuf {
    local_app_data
        .join("Google")
        .join("Chrome")
        .join("User Data")
        .join(profile)
        .join("Extensions")
}

/// 環境変数 `LOCALAPPDATA` から Default プロファイルの Extensions ルートを求める。
pub fn chrome_extensions_root_from_env() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA").filter(|v| !v.is_empty())?;
    Some(chrome_extensions_root(Path::new(&base), DEFAULT_PROFILE))
}

/// 拡張機能 ID のディレクトリ内にあるバージョンフォルダ名の一覧。
pub fn list_versions(id_dir: &Path) -> Vec<String> {
    let Ok(read) = std::fs::read_dir(id_dir) else {
        return Vec::new();
    };
    read.flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect()
}

/// `1.2.3_0` を (数値セグメント列, suffix) に分解する。数値でないものは 0。
fn parse_version_name(name: &str) -> (Vec<u64>, u64) {
    let (version, suffix) = match name.rsplit_once('_') {
        Some((v, s)) => (v, s),
        None => (name, ""),
    };
    let segments = version
        .split('.')
        .map(|s| s.parse::<u64>().unwrap_or(0))
        .collect();
    (segments, suffix.parse::<u64>().unwrap_or(0))
}

fn compare_version_names(a: &str, b: &str) -> Ordering {
    let (seg_a, suf_a) = parse_version_name(a);
    let (seg_b, suf_b) = parse_version_name(b);
    let len = seg_a.len().max(seg_b.len());
    for i in 0..len {
        let x = seg_a.get(i).copied().unwrap_or(0);
        let y = seg_b.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            Ordering::Equal => {}
            other => return other,
        }
    }
    suf_a.cmp(&suf_b)
}

/// バージョンフォルダ名から最新のものを選ぶ。
pub fn pick_latest_version(names: &[String]) -> Option<String> {
    // 同順位は名前の辞書順で決めて、入力順に依存しないようにする。
    names
        .iter()
        .max_by(|a, b| compare_version_names(a, b).then_with(|| a.cmp(b)))
        .cloned()
}

/// Chrome の拡張機能 ID（a〜p の 32 文字）か。パス組み立て前の検証に使う。
fn is_valid_chrome_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| (b'a'..=b'p').contains(&b))
}

fn latest_version_dir(id_dir: &Path) -> Option<PathBuf> {
    let latest = pick_latest_version(&list_versions(id_dir))?;
    Some(id_dir.join(latest))
}

/// Chrome 由来の拡張機能の最新バージョンのフォルダ。無ければ None（「見つかりません」判定）。
pub fn resolve_chrome_extension_path(root: &Path, chrome_id: &str) -> Option<PathBuf> {
    if !is_valid_chrome_id(chrome_id) {
        return None;
    }
    latest_version_dir(&root.join(chrome_id))
}

/// Chrome の Extensions ルートから拡張機能を検出する。
pub fn detect_extensions(
    root: &Path,
    preferred_locale: &str,
    added_chrome_ids: &HashSet<String>,
) -> DetectOutcome {
    if !root.is_dir() {
        return DetectOutcome {
            chrome_found: false,
            items: Vec::new(),
        };
    }

    let mut items = Vec::new();
    if let Ok(read) = std::fs::read_dir(root) {
        for entry in read.flatten() {
            let Ok(chrome_id) = entry.file_name().into_string() else {
                continue;
            };
            // `Temp` など拡張機能 ID 以外のフォルダは対象外。
            if !is_valid_chrome_id(&chrome_id) || !entry.path().is_dir() {
                continue;
            }
            let Some(dir) = latest_version_dir(&entry.path()) else {
                continue;
            };
            match read_manifest_info(&dir, preferred_locale) {
                Ok(info) => items.push(DetectedExtension {
                    added: added_chrome_ids.contains(&chrome_id),
                    chrome_id,
                    profile: DEFAULT_PROFILE.to_string(),
                    name: info.name,
                    path: dir.to_string_lossy().into_owned(),
                    has_popup: info.has_popup,
                    has_options: info.has_options,
                }),
                Err(e) => log::warn!(
                    "[extensions] Chrome 拡張機能を読み込めないため除外: id={chrome_id} dir={} err={e}",
                    dir.display()
                ),
            }
        }
    }
    items.sort_by(|a, b| {
        a.name
            .cmp(&b.name)
            .then_with(|| a.chrome_id.cmp(&b.chrome_id))
    });
    DetectOutcome {
        chrome_found: true,
        items,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    const ID_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const ID_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    fn names(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    /// `<root>/<id>/<version>/manifest.json` を作る。
    fn 拡張機能を置く(root: &Path, id: &str, version: &str, manifest: &str) -> PathBuf {
        let dir = root.join(id).join(version);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), manifest).unwrap();
        dir
    }

    fn 空の集合() -> HashSet<String> {
        HashSet::new()
    }

    // ---- 検出 ----

    #[test]
    fn chromeにインストール済みの拡張機能が候補として一覧表示される() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        拡張機能を置く(root, ID_B, "1.0_0", r#"{"name":"Beta"}"#);
        拡張機能を置く(
            root,
            ID_A,
            "2.0_0",
            r#"{"name":"Alpha","action":{"default_popup":"p.html"},"options_page":"o.html"}"#,
        );
        // 拡張機能 ID ではないフォルダは無視される
        fs::create_dir_all(root.join("Temp")).unwrap();

        let out = detect_extensions(root, "ja", &空の集合());

        assert!(out.chrome_found);
        assert_eq!(out.items.len(), 2);
        assert_eq!(out.items[0].name, "Alpha");
        assert_eq!(out.items[0].chrome_id, ID_A);
        assert_eq!(out.items[0].profile, "Default");
        assert!(out.items[0].has_popup);
        assert!(out.items[0].has_options);
        assert_eq!(out.items[1].name, "Beta");
        assert!(!out.items[1].has_popup);
        assert!(!out.items[1].has_options);
    }

    #[test]
    fn manifestが読めないフォルダは候補から除外される() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        拡張機能を置く(root, ID_A, "1.0_0", r#"{"name":"Alpha"}"#);
        fs::create_dir_all(root.join(ID_B).join("1.0_0")).unwrap();

        let out = detect_extensions(root, "ja", &空の集合());

        assert!(out.chrome_found);
        assert_eq!(out.items.len(), 1);
        assert_eq!(out.items[0].chrome_id, ID_A);
    }

    #[test]
    fn 拡張機能の名前が多言語メッセージ指定のときは現在の言語の名前で候補に表示される() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let dir = 拡張機能を置く(
            root,
            ID_A,
            "1.0_0",
            r#"{"name":"__MSG_extName__","default_locale":"en"}"#,
        );
        for (lang, msg) in [("ja", "日本語の名前"), ("en", "English name")] {
            let d = dir.join("_locales").join(lang);
            fs::create_dir_all(&d).unwrap();
            fs::write(
                d.join("messages.json"),
                format!(r#"{{"extName":{{"message":"{msg}"}}}}"#),
            )
            .unwrap();
        }

        let ja = detect_extensions(root, "ja", &空の集合());
        let en = detect_extensions(root, "en-US", &空の集合());

        assert_eq!(ja.items[0].name, "日本語の名前");
        assert_eq!(en.items[0].name, "English name");
    }

    #[test]
    fn 複数のバージョンが残っている拡張機能は最新のバージョンが候補になる() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        拡張機能を置く(root, ID_A, "1.9_0", r#"{"name":"Old"}"#);
        let latest = 拡張機能を置く(root, ID_A, "1.10_0", r#"{"name":"New"}"#);

        let out = detect_extensions(root, "ja", &空の集合());

        assert_eq!(out.items.len(), 1);
        assert_eq!(out.items[0].name, "New");
        assert_eq!(out.items[0].path, latest.to_string_lossy());
    }

    #[test]
    fn chromeが見つからないときは検出できず候補も空になる() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("存在しない").join("Extensions");

        let out = detect_extensions(&root, "ja", &空の集合());

        assert!(!out.chrome_found);
        assert!(out.items.is_empty());
    }

    #[test]
    fn すでに追加済みの拡張機能は候補に追加済みとして表示される() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        拡張機能を置く(root, ID_A, "1.0_0", r#"{"name":"Alpha"}"#);
        拡張機能を置く(root, ID_B, "1.0_0", r#"{"name":"Beta"}"#);
        let added: HashSet<String> = [ID_A.to_string()].into_iter().collect();

        let out = detect_extensions(root, "ja", &added);

        assert!(
            out.items
                .iter()
                .find(|i| i.chrome_id == ID_A)
                .unwrap()
                .added
        );
        assert!(
            !out.items
                .iter()
                .find(|i| i.chrome_id == ID_B)
                .unwrap()
                .added
        );
    }

    #[test]
    fn extensionsフォルダが空のときはchromeはあるが候補は空になる() {
        let tmp = tempfile::tempdir().unwrap();
        let out = detect_extensions(tmp.path(), "ja", &空の集合());
        assert!(out.chrome_found);
        assert!(out.items.is_empty());
    }

    // ---- 解決（見つかりません判定） ----

    #[test]
    fn chrome側で拡張機能が削除されたときは解決できずnoneになる() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        拡張機能を置く(root, ID_A, "1.0_0", r#"{"name":"Alpha"}"#);

        assert!(resolve_chrome_extension_path(root, ID_A).is_some());
        assert_eq!(resolve_chrome_extension_path(root, ID_B), None);
        // ID フォルダはあるがバージョンフォルダが無い場合も見つからない扱い
        fs::create_dir_all(root.join(ID_B)).unwrap();
        assert_eq!(resolve_chrome_extension_path(root, ID_B), None);
    }

    #[test]
    fn 最新バージョンのフォルダを解決する() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        拡張機能を置く(root, ID_A, "1.9_0", r#"{"name":"x"}"#);
        let latest = 拡張機能を置く(root, ID_A, "1.10_0", r#"{"name":"x"}"#);
        assert_eq!(resolve_chrome_extension_path(root, ID_A), Some(latest));
    }

    #[test]
    fn 拡張機能idとして不正な文字列は解決しない() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        拡張機能を置く(root, ID_A, "1.0_0", r#"{"name":"x"}"#);
        for bad in [
            "..",
            "../x",
            "a/b",
            "",
            "Temp",
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ] {
            assert_eq!(resolve_chrome_extension_path(root, bad), None, "{bad:?}");
        }
    }

    // ---- パス解決 ----

    #[test]
    fn chromeのextensionsルートはlocalappdata配下のdefaultプロファイルになる() {
        let root = chrome_extensions_root(Path::new("C:/Users/u/AppData/Local"), "Default");
        let expected = Path::new("C:/Users/u/AppData/Local")
            .join("Google")
            .join("Chrome")
            .join("User Data")
            .join("Default")
            .join("Extensions");
        assert_eq!(root, expected);
    }

    // ---- バージョン選択（境界） ----

    #[test]
    fn バージョンは数値として比較する() {
        assert_eq!(
            pick_latest_version(&names(&["1.9_0", "1.10_0"])).as_deref(),
            Some("1.10_0")
        );
    }

    #[test]
    fn セグメント数が違うときは不足を0とみなす() {
        // 1.2 == 1.2.0 → suffix で決まる
        assert_eq!(
            pick_latest_version(&names(&["1.2_0", "1.2.0_1"])).as_deref(),
            Some("1.2.0_1")
        );
        assert_eq!(
            pick_latest_version(&names(&["1.2.1_0", "1.2_5"])).as_deref(),
            Some("1.2.1_0")
        );
    }

    #[test]
    fn 同一バージョンではsuffixの数値が大きい方が最新になる() {
        assert_eq!(
            pick_latest_version(&names(&["1.0_2", "1.0_10", "1.0_9"])).as_deref(),
            Some("1.0_10")
        );
    }

    #[test]
    fn 数値でないセグメントは0扱いでパニックしない() {
        assert_eq!(
            pick_latest_version(&names(&["1.0b_0", "1.1_0", "abc", "x_y"])).as_deref(),
            Some("1.1_0")
        );
        assert!(pick_latest_version(&names(&["99999999999999999999999.1_0"])).is_some());
    }

    #[test]
    fn バージョンが無いときはnoneを返す() {
        assert_eq!(pick_latest_version(&[]), None);
    }

    #[test]
    fn 入力順に関係なく同じバージョンが選ばれる() {
        let a = pick_latest_version(&names(&["2.0_0", "1.0_0", "10.0_0"]));
        let b = pick_latest_version(&names(&["10.0_0", "2.0_0", "1.0_0"]));
        assert_eq!(a, b);
        assert_eq!(a.as_deref(), Some("10.0_0"));
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        /// `a.b.c_n` 形式（数値セグメントのみ）のバージョンフォルダ名。
        fn バージョン名() -> impl Strategy<Value = String> {
            // 値を小さく保ち、`1.0_0` と `1.0.0_0` や `01.0_0` のような同順位を頻繁に作る。
            (
                prop::collection::vec(0u32..4, 1..4),
                0usize..3,
                any::<bool>(),
                0u32..3,
            )
                .prop_map(|(mut segs, trailing_zeros, padded, suffix)| {
                    segs.extend(std::iter::repeat_n(0, trailing_zeros));
                    let joined = segs
                        .iter()
                        .map(|n| {
                            if padded {
                                format!("{n:02}")
                            } else {
                                n.to_string()
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(".");
                    format!("{joined}_{suffix}")
                })
        }

        fn 選ぶ(candidates: &[&String]) -> Option<String> {
            let owned: Vec<String> = candidates.iter().map(|s| (*s).clone()).collect();
            pick_latest_version(&owned)
        }

        proptest! {
            #[test]
            fn 入力の並べ替えに結果が依存しない(
                items in prop::collection::vec(バージョン名(), 0..8)
                    .prop_flat_map(|v| (Just(v.clone()), Just(v).prop_shuffle()))
            ) {
                let (original, shuffled) = items;
                prop_assert_eq!(pick_latest_version(&original), pick_latest_version(&shuffled));
            }

            #[test]
            fn 結果は入力に含まれ空のときだけnoneになる(
                items in prop::collection::vec(バージョン名(), 0..8)
            ) {
                let picked = pick_latest_version(&items);
                if items.is_empty() {
                    prop_assert_eq!(picked, None);
                } else {
                    let picked = picked.expect("非空なら Some");
                    prop_assert!(items.contains(&picked));
                }
            }

            #[test]
            fn 選ばれた版は他のどの版にも負けない(
                items in prop::collection::vec(バージョン名(), 1..8)
            ) {
                let picked = pick_latest_version(&items).expect("非空なら Some");
                for other in &items {
                    prop_assert_eq!(
                        ペア勝者(&picked, other),
                        Some(picked.clone()),
                        "{} が {} に負けている", picked, other
                    );
                }
            }

            #[test]
            fn 二つの版の勝者は並べ替えても変わらない(
                x in バージョン名(),
                y in バージョン名()
            ) {
                prop_assert_eq!(選ぶ(&[&x, &y]), 選ぶ(&[&y, &x]));
            }

            #[test]
            fn 勝敗は推移的である(
                a in バージョン名(),
                b in バージョン名(),
                c in バージョン名()
            ) {
                // a が b に勝ち、b が c に勝つなら、a は c に勝つ。
                if 選ぶ(&[&a, &b]).as_ref() == Some(&a) && 選ぶ(&[&b, &c]).as_ref() == Some(&b) {
                    prop_assert_eq!(選ぶ(&[&a, &c]), Some(a.clone()));
                }
            }

            #[test]
            fn セグメントやsuffixを一つ増やした版は元の版より新しい(
                segs in prop::collection::vec(0u32..30, 1..5),
                suffix in 0u32..6,
                index in 0usize..5
            ) {
                let render = |segs: &[u32], suffix: u32| {
                    let joined = segs.iter().map(u32::to_string).collect::<Vec<_>>().join(".");
                    format!("{joined}_{suffix}")
                };
                let original = render(&segs, suffix);

                // いずれか一つの数値セグメントを +1 する。
                let mut bumped_segs = segs.clone();
                let bump_at = index % bumped_segs.len();
                bumped_segs[bump_at] += 1;
                let bumped = render(&bumped_segs, suffix);
                prop_assert_eq!(選ぶ(&[&original, &bumped]), Some(bumped.clone()));
                prop_assert_eq!(選ぶ(&[&bumped, &original]), Some(bumped));

                // suffix を +1 する。
                let newer_suffix = render(&segs, suffix + 1);
                prop_assert_eq!(選ぶ(&[&original, &newer_suffix]), Some(newer_suffix.clone()));
                prop_assert_eq!(選ぶ(&[&newer_suffix, &original]), Some(newer_suffix));
            }

            #[test]
            fn 勝者は反対称で自分自身が相手なら自分が選ばれる(
                x in バージョン名(),
                y in バージョン名()
            ) {
                let winner = 選ぶ(&[&x, &y]).expect("非空なら Some");
                let loser = if winner == x { &y } else { &x };
                // 負けた側を勝者と比べ直しても勝者は変わらない（逆転しない）。
                prop_assert_eq!(選ぶ(&[loser, &winner]), Some(winner.clone()));
                prop_assert_eq!(選ぶ(&[&x, &x]), Some(x.clone()));
            }
        }

        fn ペア勝者(a: &str, b: &str) -> Option<String> {
            pick_latest_version(&[a.to_string(), b.to_string()])
        }
    }
}

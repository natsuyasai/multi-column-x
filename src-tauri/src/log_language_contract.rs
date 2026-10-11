// src-tauri/src/log_language_contract.rs
//
// 開発者向けメッセージ（ログ・expect・panic 等）を英語に統一するための契約テスト。
// `src` 配下の本番コードにあるログ系マクロ呼び出しのメッセージに日本語が含まれていたら失敗する。
// ユーザーに表示する文言は AppError のコード／ui_text で返すため、ここでは対象外。

use std::path::{Path, PathBuf};

/// 検査対象のマクロ名（`name!(...)`）
const MACROS: &[&str] = &[
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "eprintln",
    "eprint",
    "println",
    "print",
    "panic",
    "unreachable",
    "todo",
    "unimplemented",
    "assert",
    "assert_eq",
    "assert_ne",
    "debug_assert",
    "debug_assert_eq",
    "debug_assert_ne",
];

/// 検査対象の関数呼び出し名（`name(...)`）
const FUNCTIONS: &[&str] = &["warn_before_logger_ready"];

fn is_japanese(c: char) -> bool {
    ('\u{3040}'..='\u{30ff}').contains(&c) || ('\u{4e00}'..='\u{9fff}').contains(&c)
}

fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn blank(v: &mut [char], from: usize, to: usize) {
    for ch in v.iter_mut().take(to).skip(from) {
        if *ch != '\n' {
            *ch = ' ';
        }
    }
}

/// ソースを走査し、(コメントを空白化したコード, コメントと文字列の中身を空白化した骨格) を返す。
/// どちらも元と同じ文字数・同じ改行位置を保つ。
fn mask(src: &str) -> (Vec<char>, Vec<char>) {
    let chars: Vec<char> = src.chars().collect();
    let n = chars.len();
    let mut code = chars.clone();
    let mut skel = chars.clone();
    let mut i = 0;
    while i < n {
        let c = chars[i];
        // 行コメント
        if c == '/' && i + 1 < n && chars[i + 1] == '/' {
            let start = i;
            while i < n && chars[i] != '\n' {
                i += 1;
            }
            blank(&mut code, start, i);
            blank(&mut skel, start, i);
            continue;
        }
        // ブロックコメント（ネスト対応）
        if c == '/' && i + 1 < n && chars[i + 1] == '*' {
            let start = i;
            let mut depth = 0;
            while i < n {
                if chars[i] == '/' && i + 1 < n && chars[i + 1] == '*' {
                    depth += 1;
                    i += 2;
                } else if chars[i] == '*' && i + 1 < n && chars[i + 1] == '/' {
                    depth -= 1;
                    i += 2;
                    if depth == 0 {
                        break;
                    }
                } else {
                    i += 1;
                }
            }
            blank(&mut code, start, i);
            blank(&mut skel, start, i);
            continue;
        }
        // raw 文字列 r"..." / r#"..."#（b プレフィックス含む）
        if (c == 'r' || (c == 'b' && i + 1 < n && chars[i + 1] == 'r'))
            && (i == 0 || !is_ident_char(chars[i - 1]))
        {
            let mut j = i + if c == 'b' { 2 } else { 1 };
            let mut hashes = 0;
            while j < n && chars[j] == '#' {
                hashes += 1;
                j += 1;
            }
            if j < n && chars[j] == '"' {
                let body_start = j + 1;
                let mut k = body_start;
                let mut end = n;
                while k < n {
                    if chars[k] == '"'
                        && (0..hashes).all(|h| k + 1 + h < n && chars[k + 1 + h] == '#')
                    {
                        end = k;
                        break;
                    }
                    k += 1;
                }
                blank(&mut skel, body_start, end);
                i = (end + 1 + hashes).min(n);
                continue;
            }
        }
        // 通常の文字列
        if c == '"' {
            let body_start = i + 1;
            let mut k = body_start;
            while k < n && chars[k] != '"' {
                if chars[k] == '\\' {
                    k += 1;
                }
                k += 1;
            }
            let end = k.min(n);
            blank(&mut skel, body_start, end);
            i = (end + 1).min(n);
            continue;
        }
        // 文字リテラル（ライフタイムと区別する）
        if c == '\'' {
            if i + 1 < n && chars[i + 1] == '\\' {
                let mut k = i + 2;
                while k < n && chars[k] != '\'' {
                    k += 1;
                }
                blank(&mut skel, i + 1, k);
                i = (k + 1).min(n);
                continue;
            }
            if i + 2 < n && chars[i + 2] == '\'' {
                blank(&mut skel, i + 1, i + 2);
                i += 3;
                continue;
            }
        }
        i += 1;
    }
    (code, skel)
}

/// `open` 位置の括弧に対応する閉じ括弧の位置を返す（骨格上で数える）。
fn matching_close(skel: &[char], open: usize) -> usize {
    let mut depth = 0i32;
    for (idx, &c) in skel.iter().enumerate().skip(open) {
        match c {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => {
                depth -= 1;
                if depth == 0 {
                    return idx;
                }
            }
            _ => {}
        }
    }
    skel.len() - 1
}

fn starts_with_at(skel: &[char], at: usize, pat: &str) -> bool {
    let p: Vec<char> = pat.chars().collect();
    at + p.len() <= skel.len() && skel[at..at + p.len()] == p[..]
}

/// `i` 位置の `#[cfg(...)]` が `test` / `all(test, ...)` かを判定する（`not(test)` は対象外）。
fn cfg_attr_is_test(skel: &[char], i: usize) -> bool {
    let Some(end) = skel[i..].iter().position(|&c| c == ']') else {
        return false;
    };
    let body: String = skel[i..i + end]
        .iter()
        .filter(|c| !c.is_whitespace())
        .collect();
    body == "#[cfg(test)" || body.starts_with("#[cfg(all(test,")
}

/// `#[cfg(test)]` が付いた `mod …{ … }` ブロックの範囲（開始, 終了）を集める。
fn test_mod_ranges(skel: &[char]) -> Vec<(usize, usize)> {
    let attr: Vec<char> = "#[cfg(".chars().collect();
    let mut ranges = Vec::new();
    let mut i = 0;
    while i + attr.len() <= skel.len() {
        if skel[i..i + attr.len()] == attr[..] && cfg_attr_is_test(skel, i) {
            let attr_end = skel[i..]
                .iter()
                .position(|&c| c == ']')
                .map_or(i, |p| i + p + 1);
            let mut j = attr_end;
            while j < skel.len() && skel[j].is_whitespace() {
                j += 1;
            }
            if starts_with_at(skel, j, "pub ") {
                j += 4;
                while j < skel.len() && skel[j].is_whitespace() {
                    j += 1;
                }
            }
            if starts_with_at(skel, j, "mod ") {
                if let Some(rel) = skel[j..].iter().position(|&c| c == '{' || c == ';') {
                    let brace = j + rel;
                    if skel[brace] == '{' {
                        let close = matching_close(skel, brace);
                        ranges.push((i, close));
                        i = close;
                    }
                }
            }
        }
        i += 1;
    }
    ranges
}

/// 本番コードのログ系呼び出しに日本語が含まれる行番号（1 始まり）を返す。
fn find_violations(src: &str) -> Vec<usize> {
    let (code, skel) = mask(src);
    let excluded = test_mod_ranges(&skel);
    let in_excluded = |pos: usize| excluded.iter().any(|&(s, e)| pos >= s && pos <= e);
    let n = skel.len();
    let mut lines = Vec::new();
    let mut i = 0;
    while i < n {
        if !(skel[i].is_alphabetic() || skel[i] == '_') || (i > 0 && is_ident_char(skel[i - 1])) {
            i += 1;
            continue;
        }
        let start = i;
        while i < n && is_ident_char(skel[i]) {
            i += 1;
        }
        let name: String = skel[start..i].iter().collect();
        let mut j = i;
        while j < n && skel[j].is_whitespace() {
            j += 1;
        }
        let is_macro = MACROS.contains(&name.as_str()) && j < n && skel[j] == '!';
        let is_fn = FUNCTIONS.contains(&name.as_str()) && j < n && skel[j] == '(';
        let is_expect = name == "expect"
            && j < n
            && skel[j] == '('
            && skel[..start].iter().rev().find(|c| !c.is_whitespace()) == Some(&'.');
        let open = if is_macro {
            j += 1;
            while j < n && skel[j].is_whitespace() {
                j += 1;
            }
            (j < n && matches!(skel[j], '(' | '[' | '{')).then_some(j)
        } else if is_fn || is_expect {
            Some(j)
        } else {
            None
        };
        let Some(open) = open else { continue };
        if in_excluded(start) {
            continue;
        }
        let close = matching_close(&skel, open);
        if let Some(pos) = (open..=close).find(|&p| is_japanese(code[p])) {
            let line = code[..pos].iter().filter(|&&c| c == '\n').count() + 1;
            if !lines.contains(&line) {
                lines.push(line);
            }
        }
    }
    lines
}

fn collect_rs_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if path.ends_with("inject/_src") {
                continue;
            }
            collect_rs_files(&path, out);
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.ends_with(".rs") && name != "tests.rs" && !name.ends_with("_tests.rs") {
            out.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 日本語を含むログは検出される() {
        let src = "fn f() {\n    log::warn!(\"失敗しました: {e}\");\n}\n";
        assert_eq!(find_violations(src), vec![2]);
    }

    #[test]
    fn 英語のみのログは検出されない() {
        let src =
            "fn f() {\n    log::error!(\"failed to load: {e}\");\n    eprintln!(\"ok\");\n}\n";
        assert!(find_violations(src).is_empty());
    }

    #[test]
    fn コメント内の日本語は検出されない() {
        let src = "fn f() {\n    // log::warn!(\"失敗\");\n    /* panic!(\"失敗\") */\n    log::info!(\"done\"); // 完了\n}\n";
        assert!(find_violations(src).is_empty());
    }

    #[test]
    fn cfg_testのmod内は検出されない() {
        let src = "fn f() {}\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn t() {\n        assert!(true, \"失敗\");\n        println!(\"日本語\");\n    }\n}\n";
        assert!(find_violations(src).is_empty());
    }

    #[test]
    fn cfg_all_testのmod内も検出されない() {
        let src = "#[cfg(all(test, not(target_os = \"android\")))]
mod tests {
    fn t() { println!(\"日本語\"); }
}
";
        assert!(find_violations(src).is_empty());
    }

    #[test]
    fn cfg_not_testのmod内は検出される() {
        let src = "#[cfg(not(test))]
mod m {
    fn t() { println!(\"日本語\"); }
}
";
        assert_eq!(find_violations(src), vec![3]);
    }

    #[test]
    fn cfg_testのmod外の本番コードは検出される() {
        let src = "#[cfg(test)]\nmod tests {\n    fn t() { println!(\"日本語\"); }\n}\nfn g() {\n    panic!(\"致命的\");\n}\n";
        assert_eq!(find_violations(src), vec![6]);
    }

    #[test]
    fn 複数行にまたがるマクロも検出される() {
        let src = "fn f() {\n    log::warn!(\n        \"[x] id={} err={e}\",\n        \"詳細\",\n        id\n    );\n}\n";
        assert_eq!(find_violations(src), vec![4]);
    }

    #[test]
    fn expectとwarn_before_logger_readyのメッセージも検出される() {
        let src = "fn f() {\n    x.expect(\"必ず存在する\");\n    warn_before_logger_ready(&format!(\"失敗: {e}\"));\n}\n";
        assert_eq!(find_violations(src), vec![2, 3]);
    }

    #[test]
    fn ログ系以外の日本語文字列は検出されない() {
        let src = "fn f() -> &'static str {\n    let c = '{';\n    \"日本語のUI文言\"\n}\n";
        assert!(find_violations(src).is_empty());
    }

    #[test]
    fn 開発者向けメッセージに日本語が残っていない() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();
        collect_rs_files(&root, &mut files);
        assert!(!files.is_empty(), "src 配下の .rs が見つからない");
        let mut violations = Vec::new();
        for file in files {
            let src = std::fs::read_to_string(&file).expect("read source file");
            for line in find_violations(&src) {
                let rel = file.strip_prefix(&root).unwrap_or(&file);
                violations.push(format!("{}:{line}", rel.display()));
            }
        }
        assert!(
            violations.is_empty(),
            "開発者向けメッセージ（ログ・expect・panic 等）は英語で書くこと:\n{}",
            violations.join("\n")
        );
    }
}

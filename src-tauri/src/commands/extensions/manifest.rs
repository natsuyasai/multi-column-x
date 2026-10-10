//! 拡張機能の `manifest.json` 解析（OS 非依存の純粋ロジック）。
//! ファイル I/O は引数注入（`locale_loader`）か `read_manifest_info` に閉じ込める。

use std::fmt;
use std::path::Path;

use serde_json::Value;

/// 名前が解決できないときの表示名。
pub const FALLBACK_NAME: &str = "(名前なし)";

/// manifest から取り出した、アプリが必要とする情報。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestInfo {
    pub name: String,
    pub has_popup: bool,
    pub has_options: bool,
    /// 正規化済みの相対パス（`chrome-extension://<ID>/<path>` の組み立てに使う）。
    pub popup_path: Option<String>,
    pub options_path: Option<String>,
}

/// manifest 読み込みエラー。`Display` はユーザー表示向けの日本語。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestError {
    /// manifest.json が無い（または読めない）。
    NotFound,
    /// JSON として壊れている／オブジェクトではない。
    Invalid,
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ManifestError::NotFound => {
                write!(
                    f,
                    "拡張機能として読み込めません（manifest.json が見つかりません）"
                )
            }
            ManifestError::Invalid => {
                write!(
                    f,
                    "拡張機能として読み込めません（manifest.json の内容が不正です）"
                )
            }
        }
    }
}

impl std::error::Error for ManifestError {}

/// manifest の文字列を解析する。`locale_loader` はロケール名から messages.json の中身を返す。
pub fn parse_manifest(
    manifest_json: &str,
    locale_loader: impl Fn(&str) -> Option<String>,
    preferred_locale: &str,
) -> Result<ManifestInfo, ManifestError> {
    let text = manifest_json.trim_start_matches('\u{feff}');
    let value: Value = serde_json::from_str(text).map_err(|_| ManifestError::Invalid)?;
    let obj = value.as_object().ok_or(ManifestError::Invalid)?;

    let default_locale = obj.get("default_locale").and_then(Value::as_str);
    let raw_name = obj.get("name").and_then(Value::as_str).unwrap_or("");
    let name = resolve_name(raw_name, &locale_loader, preferred_locale, default_locale);

    let popup_path = ["action", "browser_action", "page_action"]
        .iter()
        .find_map(|key| {
            obj.get(*key)
                .and_then(|v| v.get("default_popup"))
                .and_then(Value::as_str)
        })
        .and_then(normalize_relative_path);

    let options_raw = obj.get("options_page").and_then(Value::as_str).or_else(|| {
        obj.get("options_ui")
            .and_then(|v| v.get("page"))
            .and_then(Value::as_str)
    });
    let options_path = options_raw.and_then(normalize_relative_path);

    Ok(ManifestInfo {
        name,
        has_popup: popup_path.is_some(),
        has_options: options_path.is_some(),
        popup_path,
        options_path,
    })
}

/// フォルダ内の `manifest.json`（と `_locales`）を読んで解析する。
pub fn read_manifest_info(
    dir: &Path,
    preferred_locale: &str,
) -> Result<ManifestInfo, ManifestError> {
    let bytes = std::fs::read(dir.join("manifest.json")).map_err(|_| ManifestError::NotFound)?;
    let text = String::from_utf8_lossy(&bytes);
    let loader = |locale: &str| {
        if !is_safe_locale_name(locale) {
            return None;
        }
        let path = dir.join("_locales").join(locale).join("messages.json");
        std::fs::read(path)
            .ok()
            .map(|b| String::from_utf8_lossy(&b).into_owned())
    };
    parse_manifest(&text, loader, preferred_locale)
}

/// ロケール名がパス区切りなどを含まないか（ディレクトリ名として安全か）。
fn is_safe_locale_name(locale: &str) -> bool {
    !locale.is_empty()
        && locale
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// `__MSG_xxx__` を解決する。解決できなければ生の名前から `__MSG_` 等を除いた文字列。
fn resolve_name(
    raw_name: &str,
    locale_loader: &impl Fn(&str) -> Option<String>,
    preferred_locale: &str,
    default_locale: Option<&str>,
) -> String {
    let trimmed = raw_name.trim();
    let Some(key) = msg_key(trimmed) else {
        return non_empty_or_fallback(trimmed);
    };

    let mut candidates = locale_candidates(preferred_locale);
    if let Some(d) = default_locale {
        candidates.extend(locale_candidates(d));
    }
    candidates.extend(["en".to_string(), "en_US".to_string(), "en_GB".to_string()]);

    let mut tried: Vec<String> = Vec::new();
    for locale in candidates {
        if tried.contains(&locale) {
            continue;
        }
        tried.push(locale.clone());
        if let Some(message) = locale_loader(&locale).and_then(|json| lookup_message(&json, key)) {
            return non_empty_or_fallback(message.trim());
        }
    }

    let stripped = trimmed
        .strip_prefix("__MSG_")
        .unwrap_or(trimmed)
        .trim_end_matches("__");
    non_empty_or_fallback(stripped)
}

/// `__MSG_xxx__` の `xxx` を返す。
fn msg_key(name: &str) -> Option<&str> {
    let inner = name.strip_prefix("__MSG_")?.strip_suffix("__")?;
    if inner.is_empty() {
        None
    } else {
        Some(inner)
    }
}

fn non_empty_or_fallback(s: &str) -> String {
    if s.is_empty() {
        FALLBACK_NAME.to_string()
    } else {
        s.to_string()
    }
}

/// ロケール候補（`ja-JP` → `ja_JP`, `ja`）。
fn locale_candidates(locale: &str) -> Vec<String> {
    let normalized = locale.trim().replace('-', "_");
    if normalized.is_empty() {
        return Vec::new();
    }
    let mut out = vec![normalized.clone()];
    if let Some((lang, _)) = normalized.split_once('_') {
        out.push(lang.to_string());
    }
    out
}

/// messages.json からキー（大文字小文字無視）の `message` を探す。
fn lookup_message(messages_json: &str, key: &str) -> Option<String> {
    let value: Value = serde_json::from_str(messages_json.trim_start_matches('\u{feff}')).ok()?;
    let obj = value.as_object()?;
    let wanted = key.to_lowercase();
    obj.iter()
        .find(|(k, _)| k.to_lowercase() == wanted)
        .and_then(|(_, v)| v.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// popup / options のパスを相対パスへ正規化する。不正なら None。
/// 後続で `chrome-extension://<ID>/<path>` を組み立てるため、拡張機能フォルダ外や
/// 別オリジンを指す形は拒否する。
fn normalize_relative_path(raw: &str) -> Option<String> {
    let mut path = raw.trim();
    while let Some(rest) = path.strip_prefix("./") {
        path = rest;
    }
    // 先頭の `/` は 1 つだけ許容（`//host` 形式は不正）。
    if let Some(rest) = path.strip_prefix('/') {
        path = rest;
    }
    if path.is_empty() || path.starts_with('/') {
        return None;
    }
    let lower = path.to_lowercase();
    let invalid = path.contains("..")
        || path.contains('\\')
        || path.contains(':')
        || path.chars().any(char::is_control)
        || lower.contains("%2e")
        || lower.contains("%2f")
        || lower.contains("%5c");
    if invalid {
        return None;
    }
    Some(path.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn loader_none(_: &str) -> Option<String> {
        None
    }

    fn manifest_with_name(name: &str) -> String {
        format!(r#"{{"name":"{name}","version":"1.0","default_locale":"en"}}"#)
    }

    fn メッセージ(locale: &str) -> Option<String> {
        match locale {
            "ja" => Some(r#"{"extName":{"message":"日本語の名前"}}"#.to_string()),
            "en" => Some(r#"{"extName":{"message":"English name"}}"#.to_string()),
            _ => None,
        }
    }

    // ---- 読み込みエラー ----

    #[test]
    fn manifestが無いフォルダを指定すると追加されずエラーが表示される() {
        let dir = tempfile::tempdir().unwrap();
        let err = read_manifest_info(dir.path(), "ja").unwrap_err();
        assert_eq!(err, ManifestError::NotFound);
        assert_eq!(
            err.to_string(),
            "拡張機能として読み込めません（manifest.json が見つかりません）"
        );
    }

    #[test]
    fn manifestが壊れているフォルダは読み込めない旨のエラーになる() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("manifest.json"), "{ not json").unwrap();
        let err = read_manifest_info(dir.path(), "ja").unwrap_err();
        assert_eq!(err, ManifestError::Invalid);
        assert!(err.to_string().starts_with("拡張機能として読み込めません"));
    }

    // ---- 名前の解決 ----

    #[test]
    fn 拡張機能の名前が多言語メッセージ指定のときは翻訳された名前で表示される() {
        let json = manifest_with_name("__MSG_extName__");
        let info = parse_manifest(&json, メッセージ, "ja").unwrap();
        assert_eq!(info.name, "日本語の名前");
    }

    #[test]
    fn 多言語メッセージは地域付きロケールから言語へフォールバックする() {
        let json = manifest_with_name("__MSG_extName__");
        let info = parse_manifest(&json, メッセージ, "ja-JP").unwrap();
        assert_eq!(info.name, "日本語の名前");
    }

    #[test]
    fn 多言語メッセージのキーは大文字小文字を無視して照合する() {
        let json = manifest_with_name("__MSG_EXTNAME__");
        let info = parse_manifest(&json, メッセージ, "ja").unwrap();
        assert_eq!(info.name, "日本語の名前");
    }

    #[test]
    fn 希望ロケールが無ければdefault_localeの名前になる() {
        let json = r#"{"name":"__MSG_extName__","default_locale":"en"}"#;
        let info = parse_manifest(json, メッセージ, "fr").unwrap();
        assert_eq!(info.name, "English name");
    }

    #[test]
    fn default_localeが無くても英語のメッセージにフォールバックする() {
        let json = r#"{"name":"__MSG_extName__"}"#;
        let info = parse_manifest(json, メッセージ, "fr").unwrap();
        assert_eq!(info.name, "English name");
    }

    #[test]
    fn 多言語メッセージが解決できないときは生の名前から接頭辞を除いた文字列になる() {
        let json = manifest_with_name("__MSG_extName__");
        let info = parse_manifest(&json, loader_none, "ja").unwrap();
        assert_eq!(info.name, "extName");
        assert!(!info.name.contains("__MSG_"));
    }

    #[test]
    fn 名前が無いときは名前なしの表示になる() {
        let info = parse_manifest(r#"{"version":"1"}"#, loader_none, "ja").unwrap();
        assert_eq!(info.name, FALLBACK_NAME);
        let info = parse_manifest(r#"{"name":"  "}"#, loader_none, "ja").unwrap();
        assert_eq!(info.name, FALLBACK_NAME);
    }

    #[test]
    fn 通常の名前はそのまま使われる() {
        let info = parse_manifest(r#"{"name":"My Ext"}"#, loader_none, "ja").unwrap();
        assert_eq!(info.name, "My Ext");
    }

    #[test]
    fn bom付きのmanifestも読み込める() {
        let dir = tempfile::tempdir().unwrap();
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(r#"{"name":"BOM Ext"}"#.as_bytes());
        fs::write(dir.path().join("manifest.json"), bytes).unwrap();
        let info = read_manifest_info(dir.path(), "ja").unwrap();
        assert_eq!(info.name, "BOM Ext");
    }

    #[test]
    fn フォルダ内の_localesから翻訳された名前を読む() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("manifest.json"),
            manifest_with_name("__MSG_extName__"),
        )
        .unwrap();
        let ja = dir.path().join("_locales").join("ja");
        fs::create_dir_all(&ja).unwrap();
        fs::write(
            ja.join("messages.json"),
            r#"{"extName":{"message":"日本語の名前"}}"#,
        )
        .unwrap();
        let info = read_manifest_info(dir.path(), "ja").unwrap();
        assert_eq!(info.name, "日本語の名前");
    }

    // ---- popup / options ----

    #[test]
    fn popupとoptionsの有無と相対パスを取り出す() {
        let json = r#"{"name":"x","action":{"default_popup":"/popup.html"},
            "options_ui":{"page":"./opts/index.html"}}"#;
        let info = parse_manifest(json, loader_none, "ja").unwrap();
        assert!(info.has_popup);
        assert!(info.has_options);
        assert_eq!(info.popup_path.as_deref(), Some("popup.html"));
        assert_eq!(info.options_path.as_deref(), Some("opts/index.html"));
    }

    #[test]
    fn browser_actionとoptions_pageにも対応する() {
        let json = r#"{"name":"x","browser_action":{"default_popup":"p.html"},
            "options_page":"o.html"}"#;
        let info = parse_manifest(json, loader_none, "ja").unwrap();
        assert_eq!(info.popup_path.as_deref(), Some("p.html"));
        assert_eq!(info.options_path.as_deref(), Some("o.html"));
    }

    #[test]
    fn popupもoptionsも無い拡張機能は両方falseになる() {
        let info = parse_manifest(r#"{"name":"x","action":{}}"#, loader_none, "ja").unwrap();
        assert!(!info.has_popup);
        assert!(!info.has_options);
        assert_eq!(info.popup_path, None);
        assert_eq!(info.options_path, None);
    }

    #[test]
    fn 不正なpopupとoptionsのパスは無いものとして扱う() {
        let bad = [
            "../evil.html",
            "a/../../evil.html",
            "a/..",
            "C:/evil.html",
            "C:\\evil.html",
            "https://evil.example/p.html",
            "chrome-extension://abc/p.html",
            "a\\b.html",
            "//evil.example/p.html",
            "%2e%2e/evil.html",
            "",
            "/",
            "./",
        ];
        for p in bad {
            let json = serde_json::json!({
                "name": "x",
                "action": {"default_popup": p},
                "options_page": p,
            })
            .to_string();
            let info = parse_manifest(&json, loader_none, "ja").unwrap();
            assert!(!info.has_popup, "popup が拒否されていない: {p:?}");
            assert!(!info.has_options, "options が拒否されていない: {p:?}");
            assert_eq!(info.popup_path, None, "{p:?}");
            assert_eq!(info.options_path, None, "{p:?}");
        }
    }

    #[test]
    fn 先頭のスラッシュとドットスラッシュだけを除いて正規化する() {
        assert_eq!(
            normalize_relative_path("./././a/b.html").as_deref(),
            Some("a/b.html")
        );
        assert_eq!(
            normalize_relative_path("/a/b.html").as_deref(),
            Some("a/b.html")
        );
        assert_eq!(
            normalize_relative_path("a.html?x=1").as_deref(),
            Some("a.html?x=1")
        );
    }

    mod properties {
        use proptest::prelude::*;

        use super::super::normalize_relative_path;

        fn 通常の文字列() -> impl Strategy<Value = String> {
            // 制御文字や空白を含む任意の文字列。
            any::<String>()
        }

        proptest! {
            #[test]
            fn 危険なトークンを含む文字列は常にnoneになる(
                head in 通常の文字列(),
                tail in 通常の文字列(),
                token in prop::sample::select(vec!["..", ":", "\\"])
            ) {
                let raw = format!("{head}{token}{tail}");
                prop_assert_eq!(normalize_relative_path(&raw), None, "{:?}", raw);
            }

            #[test]
            fn 先頭のスラッシュが二つ以上あると常にnoneになる(tail in 通常の文字列()) {
                let raw = format!("//{tail}");
                prop_assert_eq!(normalize_relative_path(&raw), None, "{:?}", raw);
            }

            #[test]
            fn エンコードされたドットとスラッシュと区切りを含む文字列は常にnoneになる(
                head in 通常の文字列(),
                tail in 通常の文字列(),
                token in prop::sample::select(vec!["%2e", "%2E", "%2f", "%2F", "%5c", "%5C"])
            ) {
                let raw = format!("{head}{token}{tail}");
                prop_assert_eq!(normalize_relative_path(&raw), None, "{:?}", raw);
            }

            #[test]
            fn 正規化に成功した結果は相対パスとして安全である(raw in 通常の文字列()) {
                if let Some(path) = normalize_relative_path(&raw) {
                    prop_assert!(!path.is_empty());
                    prop_assert!(!path.starts_with('/'));
                    prop_assert!(!path.contains(".."));
                    prop_assert!(!path.contains(':'));
                    prop_assert!(!path.contains('\\'));
                    prop_assert!(!path.chars().any(char::is_control));
                }
            }

            #[test]
            fn 安全な相対パスは正規化しても変わらない(
                segments in prop::collection::vec("[a-zA-Z0-9_-]{1,8}([.][a-z]{1,4})?", 1..4)
            ) {
                let path = segments.join("/");
                prop_assert_eq!(normalize_relative_path(&path), Some(path.clone()));
                prop_assert_eq!(normalize_relative_path(&format!("/{path}")), Some(path.clone()));
                prop_assert_eq!(normalize_relative_path(&format!("./{path}")), Some(path));
            }
        }
    }
}

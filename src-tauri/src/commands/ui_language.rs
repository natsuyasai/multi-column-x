//! Rust が直接使う文言（ネイティブウィンドウのタイトル、ファイル選択のフィルタ名）の ja/en 表と、
//! 表示言語の解決。解決規則は TypeScript の `src/lib/language.ts` と同じ。
use tauri::AppHandle;

use crate::commands::settings_store::load_global_settings;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiLang {
    Ja,
    En,
}

impl UiLang {
    /// inject の `window.__mcxLang` に埋め込む言語コード。
    pub fn as_code(self) -> &'static str {
        match self {
            UiLang::Ja => "ja",
            UiLang::En => "en",
        }
    }
}

/// 言語設定と OS ロケールから表示言語を決める（純粋関数）。
/// 設定が `ja` / `en` ならそのまま。それ以外（`auto`・未対応値）は OS ロケールが `ja` で始まれば日本語、
/// それ以外・取得不能は英語。
pub fn resolve_ui_lang(setting: &str, os_locale: Option<&str>) -> UiLang {
    match setting {
        "ja" => UiLang::Ja,
        "en" => UiLang::En,
        _ => {
            if os_locale.is_some_and(|l| l.to_lowercase().starts_with("ja")) {
                UiLang::Ja
            } else {
                UiLang::En
            }
        }
    }
}

/// 設定ストアの `globalSettings.language` と OS ロケールから現在の表示言語を決める。
/// 設定が読めない場合は `auto` として扱う。
pub fn current_ui_lang(app: &AppHandle) -> UiLang {
    let global = load_global_settings(app);
    let setting = global
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("auto");
    resolve_ui_lang(setting, sys_locale::get_locale().as_deref())
}

/// 現在の表示言語で `key` の文言を返す（ウィンドウ生成時に呼ぶ。生成済みのウィンドウには影響しない）。
pub fn current_ui_text(app: &AppHandle, key: UiText) -> &'static str {
    ui_text(key, current_ui_lang(app))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiText {
    WindowTitleMedia,
    WindowTitleLink,
    WindowTitleCompose,
    WindowTitleAddAccount,
    WindowTitleReauth,
    BackupFileFilter,
    #[cfg_attr(not(windows), allow(dead_code))]
    // Windows 専用の拡張機能ページのタイトルからのみ使う
    ExtensionUnnamed,
}

impl UiText {
    /// 全項目（網羅テスト用）。
    #[cfg(test)]
    pub const ALL: [UiText; 7] = [
        UiText::WindowTitleMedia,
        UiText::WindowTitleLink,
        UiText::WindowTitleCompose,
        UiText::WindowTitleAddAccount,
        UiText::WindowTitleReauth,
        UiText::BackupFileFilter,
        UiText::ExtensionUnnamed,
    ];
}

pub fn ui_text(key: UiText, lang: UiLang) -> &'static str {
    match (key, lang) {
        (UiText::WindowTitleMedia, UiLang::Ja) => "X - メディア",
        (UiText::WindowTitleMedia, UiLang::En) => "X - Media",
        (UiText::WindowTitleLink, UiLang::Ja) => "X - リンク",
        (UiText::WindowTitleLink, UiLang::En) => "X - Link",
        (UiText::WindowTitleCompose, UiLang::Ja) => "X - ツイート",
        (UiText::WindowTitleCompose, UiLang::En) => "X - Compose",
        (UiText::WindowTitleAddAccount, UiLang::Ja) => "アカウントを追加",
        (UiText::WindowTitleAddAccount, UiLang::En) => "Add account",
        (UiText::WindowTitleReauth, UiLang::Ja) => "アカウントを再認証",
        (UiText::WindowTitleReauth, UiLang::En) => "Re-authenticate account",
        (UiText::BackupFileFilter, UiLang::Ja) => "Multi Column X バックアップ",
        (UiText::BackupFileFilter, UiLang::En) => "Multi Column X Backup",
        (UiText::ExtensionUnnamed, UiLang::Ja) => "(名前なし)",
        (UiText::ExtensionUnnamed, UiLang::En) => "(Unnamed)",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contains_japanese(s: &str) -> bool {
        s.chars()
            .any(|c| matches!(c, '\u{3040}'..='\u{30ff}' | '\u{4e00}'..='\u{9fff}'))
    }

    #[test]
    fn 表示言語は注入スクリプト用の言語コードに変換される() {
        assert_eq!(UiLang::Ja.as_code(), "ja");
        assert_eq!(UiLang::En.as_code(), "en");
    }

    #[test]
    fn 言語解決は設定とosロケールの組み合わせごとに期待どおりになる() {
        let cases: [(&str, Option<&str>, UiLang); 16] = [
            ("auto", Some("ja"), UiLang::Ja),
            ("auto", Some("ja-JP"), UiLang::Ja),
            ("auto", Some("JA_jp"), UiLang::Ja),
            ("auto", Some("en-US"), UiLang::En),
            ("auto", Some("fr-FR"), UiLang::En),
            ("auto", Some("zh-CN"), UiLang::En),
            ("auto", None, UiLang::En),
            ("auto", Some(""), UiLang::En),
            ("ja", Some("en-US"), UiLang::Ja),
            ("ja", None, UiLang::Ja),
            ("en", Some("ja-JP"), UiLang::En),
            ("en", None, UiLang::En),
            ("fr", Some("ja-JP"), UiLang::Ja),
            ("fr", Some("en-US"), UiLang::En),
            ("fr", None, UiLang::En),
            ("", Some("ja"), UiLang::Ja),
        ];
        for (setting, os, expected) in cases {
            assert_eq!(resolve_ui_lang(setting, os), expected, "{setting} / {os:?}");
        }
    }

    #[test]
    fn 日本語の表は現行の文字列と一致する() {
        let expected = [
            (UiText::WindowTitleMedia, "X - メディア"),
            (UiText::WindowTitleLink, "X - リンク"),
            (UiText::WindowTitleCompose, "X - ツイート"),
            (UiText::WindowTitleAddAccount, "アカウントを追加"),
            (UiText::WindowTitleReauth, "アカウントを再認証"),
            (UiText::BackupFileFilter, "Multi Column X バックアップ"),
            (UiText::ExtensionUnnamed, "(名前なし)"),
        ];
        assert_eq!(expected.len(), UiText::ALL.len());
        for (key, text) in expected {
            assert_eq!(ui_text(key, UiLang::Ja), text);
        }
    }

    #[test]
    fn 英語の表は日本語を含まず空でない() {
        for key in UiText::ALL {
            let text = ui_text(key, UiLang::En);
            assert!(!text.is_empty(), "{key:?}");
            assert!(!contains_japanese(text), "{key:?}: {text}");
        }
    }

    #[test]
    fn 日本語の表は全キーで空でない() {
        for key in UiText::ALL {
            assert!(!ui_text(key, UiLang::Ja).is_empty(), "{key:?}");
        }
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// 明示設定の ja / en は OS ロケールに依存しない。
            #[test]
            fn 明示設定はosロケールに依存しない(os in proptest::option::of(any::<String>())) {
                prop_assert_eq!(resolve_ui_lang("ja", os.as_deref()), UiLang::Ja);
                prop_assert_eq!(resolve_ui_lang("en", os.as_deref()), UiLang::En);
            }

            /// 任意の文字列でも panic せず、ja か en のいずれかを返す。
            #[test]
            fn 任意の入力でもpanicせずjaかenを返す(
                setting in any::<String>(),
                os in proptest::option::of(any::<String>()),
            ) {
                let lang = resolve_ui_lang(&setting, os.as_deref());
                prop_assert!(lang == UiLang::Ja || lang == UiLang::En);
            }
        }
    }
}

//! フロントエンドへ返すエラー。文言ではなく種別コード（`code`）と詳細（`detail`）だけを持つ。
//! 表示用の文言への変換は TypeScript 側（`src/lib/appError.ts` と辞書 `rustError.*`）が行う。
use std::fmt;

use serde::Serialize;

/// エラー種別コード。`<領域>.<camelCase名>` 形式（ASCII のみ）で、辞書の `rustError.<領域>.<名前>` と対応する。
/// 追加したら `src/locales/{ja,en}/messages.json` にも同じキーを足すこと（契約テストが検査する）。
pub mod codes {}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AppError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub const fn new(code: &'static str) -> Self {
        Self { code, detail: None }
    }

    /// OS / WebView 由来のエラー文字列や HRESULT の 16 進など、文言に混ぜない詳細を添える。
    pub fn with_detail(code: &'static str, detail: impl fmt::Display) -> Self {
        Self {
            code,
            detail: Some(detail.to_string()),
        }
    }
}

/// ログ・デバッグ用の英語固定表記（`code` または `code: detail`）。
impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{}: {}", self.code, detail),
            None => write!(f, "{}", self.code),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detailなしのjsonはcodeだけを持つ() {
        let json = serde_json::to_value(AppError::new("common.sample")).unwrap();

        assert_eq!(json, serde_json::json!({ "code": "common.sample" }));
    }

    #[test]
    fn detailありのjsonはcodeとdetailを持つ() {
        let json =
            serde_json::to_value(AppError::with_detail("common.sample", "0x80070002")).unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "code": "common.sample", "detail": "0x80070002" })
        );
    }

    #[test]
    fn displayはdetailなしならcodeのみを返す() {
        assert_eq!(AppError::new("common.sample").to_string(), "common.sample");
    }

    #[test]
    fn displayはdetailありならcodeとdetailをコロンでつなぐ() {
        assert_eq!(
            AppError::with_detail("common.sample", "boom").to_string(),
            "common.sample: boom"
        );
    }
}

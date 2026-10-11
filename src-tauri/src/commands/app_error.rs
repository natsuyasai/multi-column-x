//! フロントエンドへ返すエラー。文言ではなく種別コード（`code`）と詳細（`detail`）だけを持つ。
//! 表示用の文言への変換は TypeScript 側（`src/lib/appError.ts` と辞書 `rustError.*`）が行う。
use std::fmt;

use serde::Serialize;

/// エラー種別コード。`<領域>.<camelCase名>` 形式（ASCII のみ）で、辞書の `rustError.<領域>.<名前>` と対応する。
/// 追加したら `src/locales/{ja,en}/messages.json` にも同じキーを足すこと（契約テストが検査する）。
pub mod codes {
    pub const COMMON_INTERNAL: &str = "common.internal";
    pub const EXTENSION_NOT_FOUND: &str = "extension.notFound";
    pub const EXTENSION_UNSUPPORTED: &str = "extension.unsupported";
    pub const EXTENSION_ALREADY_ADDED: &str = "extension.alreadyAdded";
    pub const EXTENSION_NETWORK_FOLDER: &str = "extension.networkFolder";
    pub const EXTENSION_FOLDER_NOT_FOUND: &str = "extension.folderNotFound";
    pub const EXTENSION_FOLDER_REQUIRED: &str = "extension.folderRequired";
    pub const EXTENSION_FOLDER_UNREADABLE: &str = "extension.folderUnreadable";
    pub const EXTENSION_FOLDER_TOO_LARGE: &str = "extension.folderTooLarge";
    pub const EXTENSION_NO_BROWSER: &str = "extension.noBrowser";
    pub const EXTENSION_NOT_IN_BROWSER: &str = "extension.notInBrowser";
    pub const EXTENSION_NO_POPUP: &str = "extension.noPopup";
    pub const EXTENSION_NO_OPTIONS: &str = "extension.noOptions";
    pub const EXTENSION_NO_PAGE: &str = "extension.noPage";
    pub const EXTENSION_DISABLED: &str = "extension.disabled";
    pub const EXTENSION_INVALID_KIND: &str = "extension.invalidKind";
    pub const EXTENSION_INVALID_ID: &str = "extension.invalidId";
    pub const EXTENSION_INVALID_ENTRY_ID: &str = "extension.invalidEntryId";
    pub const EXTENSION_INVALID_PAGE_PATH: &str = "extension.invalidPagePath";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_INVALID_URL: &str = "extension.invalidUrl";
    pub const EXTENSION_ACCOUNT_REQUIRED: &str = "extension.accountRequired";
    pub const EXTENSION_COLUMN_REQUIRED: &str = "extension.columnRequired";
    pub const EXTENSION_NO_TARGET: &str = "extension.noTarget";
    pub const EXTENSION_DEST_INSIDE_SOURCE: &str = "extension.destInsideSource";
    pub const EXTENSION_MANIFEST_MISSING: &str = "extension.manifestMissing";
    pub const EXTENSION_MANIFEST_INVALID: &str = "extension.manifestInvalid";
    pub const EXTENSION_UNREADABLE_FILES: &str = "extension.unreadableFiles";
    pub const EXTENSION_LOAD_FAILED_PATH: &str = "extension.loadFailedPath";
    pub const EXTENSION_INVALID_DEFINITION: &str = "extension.invalidDefinition";
    pub const EXTENSION_LOAD_FAILED: &str = "extension.loadFailed";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_LIST_FAILED: &str = "extension.listFailed";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_LIST_CALL_FAILED: &str = "extension.listCallFailed";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_REMOVE_FAILED: &str = "extension.removeFailed";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_REMOVE_CALL_FAILED: &str = "extension.removeCallFailed";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_SET_ENABLED_FAILED: &str = "extension.setEnabledFailed";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_SET_ENABLED_CALL_FAILED: &str = "extension.setEnabledCallFailed";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_PROFILE_UNAVAILABLE: &str = "extension.profileUnavailable";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_WEBVIEW_ACCESS: &str = "extension.webviewAccess";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_NO_REPLY: &str = "extension.noReply";
    #[cfg_attr(not(windows), allow(dead_code))] // Windows 専用の拡張機能コードからのみ使う
    pub const EXTENSION_TIMEOUT: &str = "extension.timeout";
    pub const H264_UNSUPPORTED_ARCH: &str = "h264.unsupportedArch";
    // 使用箇所（openh264_fetch）は Linux desktop 限定のため、他環境では未使用警告を抑止する。
    #[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
    pub const H264_EXTRACT_FAILED: &str = "h264.extractFailed";
    pub const H264_DOWNLOAD_TIMEOUT: &str = "h264.downloadTimeout";
}

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

    /// 想定外の内部エラー（OS・プラグイン・ロック等が返した生の文字列）。文言は持たず `detail` をそのまま表示する。
    pub fn internal(detail: impl fmt::Display) -> Self {
        Self::with_detail(codes::COMMON_INTERNAL, detail)
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

impl std::error::Error for AppError {}

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

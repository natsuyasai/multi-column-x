//! WebView2 の拡張機能 Add 失敗時の HRESULT を種別コード（`AppError`）に変換する（OS 非依存）。
// Windows 専用の `webview2` からのみ使うため、Windows 以外ではデッドコードになる。
#![allow(dead_code)]

use crate::commands::app_error::{codes, AppError};

/// HRESULT の 16 進表記（`0x` + 8 桁大文字）。`detail` に入れる。
pub fn hresult_hex(hr: i32) -> String {
    format!("0x{:08X}", hr as u32)
}

/// Add 失敗時の HRESULT を種別コードにする。既知の HRESULT は専用コード、
/// それ以外は汎用コード＋ `detail` に 16 進のエラーコードを添える。
pub fn describe_add_error(hr: i32) -> AppError {
    match hr as u32 {
        0x8007_0002 => AppError::new(codes::EXTENSION_MANIFEST_MISSING),
        0x8007_0005 => AppError::new(codes::EXTENSION_UNREADABLE_FILES),
        0x8000_4005 => AppError::new(codes::EXTENSION_LOAD_FAILED_PATH),
        0x8007_0057 => AppError::new(codes::EXTENSION_INVALID_DEFINITION),
        _ => AppError::with_detail(codes::EXTENSION_LOAD_FAILED, hresult_hex(hr)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifestが見つからない場合のコードになる() {
        assert_eq!(
            describe_add_error(0x8007_0002_u32 as i32),
            AppError::new(codes::EXTENSION_MANIFEST_MISSING)
        );
    }

    #[test]
    fn アクセス拒否の場合は読み込めないファイルがある旨のコードになる() {
        assert_eq!(
            describe_add_error(0x8007_0005_u32 as i32),
            AppError::new(codes::EXTENSION_UNREADABLE_FILES)
        );
    }

    #[test]
    fn 汎用失敗の場合はパスを確認する旨のコードになる() {
        assert_eq!(
            describe_add_error(0x8000_4005_u32 as i32),
            AppError::new(codes::EXTENSION_LOAD_FAILED_PATH)
        );
    }

    #[test]
    fn 引数不正の場合は定義が正しくない旨のコードになる() {
        assert_eq!(
            describe_add_error(0x8007_0057_u32 as i32),
            AppError::new(codes::EXTENSION_INVALID_DEFINITION)
        );
    }

    #[test]
    fn 未知のエラーコードは汎用コードで16進はdetailに入る() {
        let error = describe_add_error(0x8007_00ab_u32 as i32);

        assert_eq!(error.code, codes::EXTENSION_LOAD_FAILED);
        assert_eq!(error.detail.as_deref(), Some("0x800700AB"));
    }

    #[test]
    fn エラーコードが小さい値でも8桁にゼロ埋めされる() {
        assert_eq!(describe_add_error(1).detail.as_deref(), Some("0x00000001"));
    }

    #[test]
    fn 既知のhresultは詳細を持たず文章も含まない() {
        let error = describe_add_error(0x8007_0002_u32 as i32);

        assert_eq!(error.detail, None);
        let json = serde_json::to_string(&error).unwrap();
        assert_eq!(json, r#"{"code":"extension.manifestMissing"}"#);
    }

    #[test]
    fn hresultの16進表記は8桁大文字になる() {
        assert_eq!(hresult_hex(0x8007_0002_u32 as i32), "0x80070002");
        assert_eq!(hresult_hex(0xabcd_u32 as i32), "0x0000ABCD");
    }
}

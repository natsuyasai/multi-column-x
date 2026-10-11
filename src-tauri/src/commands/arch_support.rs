//! OpenH264 の自動取得など、動作対象アーキテクチャを x86_64 のみに限定したい処理のための
//! 検証関数を置くモジュール。cfg 制約を持たないため Windows でもコンパイル・テストできる。

use crate::commands::app_error::{codes, AppError};

/// 実行環境のアーキテクチャ（`std::env::consts::ARCH` 相当の文字列）が
/// x86_64 かどうかを検証する（純粋関数）。
///
/// OpenH264 バイナリの配布が linux64（x86_64）専用であるため、
/// それ以外のアーキテクチャでは取得処理そのものを拒否する。
/// 呼び出し元（`openh264_fetch`）が Linux desktop 限定でコンパイルされるため、
/// それ以外の環境では未使用（dead_code）警告が出るのを抑止する。
#[cfg_attr(not(all(desktop, target_os = "linux")), allow(dead_code))]
pub(crate) fn validate_arch(arch: &str) -> Result<(), AppError> {
    if arch == "x86_64" {
        Ok(())
    } else {
        Err(AppError::with_detail(codes::H264_UNSUPPORTED_ARCH, arch))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x86_64以外のアーキテクチャは拒否する() {
        let result = validate_arch("aarch64");
        assert_eq!(
            result,
            Err(AppError::with_detail(
                codes::H264_UNSUPPORTED_ARCH,
                "aarch64"
            ))
        );
    }

    #[test]
    fn 非対応アーキテクチャのエラーは文章を含まずコードとarchだけを持つ() {
        let json = serde_json::to_value(validate_arch("aarch64").unwrap_err()).unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "code": "h264.unsupportedArch", "detail": "aarch64" })
        );
    }

    #[test]
    fn x86_64は許可する() {
        let result = validate_arch("x86_64");
        assert_eq!(result, Ok(()));
    }
}

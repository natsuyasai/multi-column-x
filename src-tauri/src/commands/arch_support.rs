//! OpenH264 の自動取得など、動作対象アーキテクチャを x86_64 のみに限定したい処理のための
//! 検証関数を置くモジュール。cfg 制約を持たないため Windows でもコンパイル・テストできる。

/// 実行環境のアーキテクチャ（`std::env::consts::ARCH` 相当の文字列）が
/// x86_64 かどうかを検証する（純粋関数）。
///
/// OpenH264 バイナリの配布が linux64（x86_64）専用であるため、
/// それ以外のアーキテクチャでは取得処理そのものを拒否する。
pub(crate) fn validate_arch(arch: &str) -> Result<(), String> {
    if arch == "x86_64" {
        Ok(())
    } else {
        Err(format!(
            "この環境（{arch}）には対応していません。H.264 コーデックの自動取得は x86_64 のみ対応です"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x86_64以外のアーキテクチャは拒否する() {
        let result = validate_arch("aarch64");
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            "この環境（aarch64）には対応していません。H.264 コーデックの自動取得は x86_64 のみ対応です"
        );
    }

    #[test]
    fn x86_64は許可する() {
        let result = validate_arch("x86_64");
        assert_eq!(result, Ok(()));
    }
}

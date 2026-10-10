//! WebView2 の拡張機能 Add 失敗時の HRESULT をユーザー向け文言に変換する（OS 非依存）。
// Windows 専用の `webview2` からのみ使うため、Windows 以外ではデッドコードになる。
#![allow(dead_code)]

/// Add 失敗時の HRESULT をユーザー向けのエラー文言にする。
pub fn describe_add_error(hr: i32) -> String {
    match hr as u32 {
        0x8007_0002 => "拡張機能として読み込めません（manifest.json が見つかりません）".to_string(),
        0x8007_0005 => {
            "拡張機能に読み込めないファイルが含まれています（名前が「_」で始まるファイルなど）"
                .to_string()
        }
        0x8000_4005 => "拡張機能を読み込めませんでした（パスを確認してください）".to_string(),
        0x8007_0057 => "拡張機能の定義が正しくありません".to_string(),
        code => format!("拡張機能を読み込めませんでした（エラーコード 0x{code:08X}）"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifestが見つからない場合の文言になる() {
        assert_eq!(
            describe_add_error(0x8007_0002_u32 as i32),
            "拡張機能として読み込めません（manifest.json が見つかりません）"
        );
    }

    #[test]
    fn アクセス拒否の場合は読み込めないファイルがある旨の文言になる() {
        assert_eq!(
            describe_add_error(0x8007_0005_u32 as i32),
            "拡張機能に読み込めないファイルが含まれています（名前が「_」で始まるファイルなど）"
        );
    }

    #[test]
    fn 汎用失敗の場合はパスを確認する旨の文言になる() {
        assert_eq!(
            describe_add_error(0x8000_4005_u32 as i32),
            "拡張機能を読み込めませんでした（パスを確認してください）"
        );
    }

    #[test]
    fn 引数不正の場合は定義が正しくない旨の文言になる() {
        assert_eq!(
            describe_add_error(0x8007_0057_u32 as i32),
            "拡張機能の定義が正しくありません"
        );
    }

    #[test]
    fn 未知のエラーコードは8桁大文字16進で文言に含まれる() {
        assert_eq!(
            describe_add_error(0x8007_00ab_u32 as i32),
            "拡張機能を読み込めませんでした（エラーコード 0x800700AB）"
        );
    }

    #[test]
    fn エラーコードが小さい値でも8桁にゼロ埋めされる() {
        assert_eq!(
            describe_add_error(1),
            "拡張機能を読み込めませんでした（エラーコード 0x00000001）"
        );
    }
}

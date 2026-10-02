//! 新規ウィンドウ要求（`target=_blank` / `window.open`）の URL を外部ブラウザで開くハンドラ。
//! 応答は常に Deny とし、アプリ内に新規ウィンドウを作らない。
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

/// 外部ブラウザで開いてよいスキーム。
const OPENABLE_SCHEMES: [&str; 4] = ["http", "https", "mailto", "tel"];

/// 新規ウィンドウ要求の URL を外部ブラウザで開いてよいか（純粋関数）。
// ステップ2で builder に適用するまで未使用になるため一時的に許容する。
#[allow(dead_code)]
pub(crate) fn is_openable_external_url(url: &Url) -> bool {
    OPENABLE_SCHEMES.contains(&url.scheme())
}

/// 新規ウィンドウ要求を処理する。`open` は外部ブラウザ起動（テストで差し替える）。
/// 応答は常に Deny（アプリ内に新規ウィンドウを作らない）。
#[allow(dead_code)]
pub(crate) fn handle_new_window<R: Runtime>(
    url: &Url,
    open: impl FnOnce(&str),
) -> NewWindowResponse<R> {
    open_if_openable(url, open);
    NewWindowResponse::Deny
}

/// 許可スキームのときだけ `open` を1回呼ぶ。呼んだかどうかを返す。
/// `handle_new_window` から Runtime 非依存の判定部分を切り出したもの
/// （Windows ではランタイム型を実体化するとテストバイナリが起動できなくなるため、テストはこちらで行う）。
fn open_if_openable(url: &Url, open: impl FnOnce(&str)) -> bool {
    if !is_openable_external_url(url) {
        return false;
    }
    open(url.as_str());
    true
}

/// builder の `.on_new_window(..)` に渡すハンドラを作る。
/// 失敗時のログには URL（クエリに個人情報があり得る）を出さない。
#[allow(dead_code)]
pub(crate) fn new_window_handler<R: Runtime>(
    app: AppHandle<R>,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static {
    move |url, _features| {
        handle_new_window::<R>(&url, |u| {
            if let Err(e) = app.opener().open_url(u, None::<&str>) {
                log::warn!("外部ブラウザの起動に失敗しました: {e}");
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn parse(s: &str) -> Url {
        s.parse().expect("テスト用URLはパースできるはず")
    }

    #[test]
    fn 許可スキームのurlは外部ブラウザで開く対象と判定される() {
        let urls = [
            "https://www.youtube.com/watch?v=abc123",
            "http://example.com/page",
            "https://t.co/AbCdEf",
            "mailto:someone@example.com",
            "tel:+81312345678",
        ];
        for u in urls {
            assert!(is_openable_external_url(&parse(u)), "{u}");
        }
    }

    #[test]
    fn 許可しないスキームのurlは外部ブラウザで開く対象と判定されない() {
        let urls = [
            "javascript:alert(1)",
            "file:///C:/Windows/System32/cmd.exe",
            "data:text/html,<script>1</script>",
            "ms-msdt:/id",
            "about:blank",
        ];
        for u in urls {
            assert!(!is_openable_external_url(&parse(u)), "{u}");
        }
    }

    #[test]
    fn 許可スキームの新規ウィンドウ要求は外部ブラウザで開く() {
        let opened: RefCell<Vec<String>> = RefCell::new(Vec::new());
        let url = parse("https://www.youtube.com/watch?v=abc123");

        let called = open_if_openable(&url, |u| opened.borrow_mut().push(u.to_string()));

        assert!(called);
        assert_eq!(
            *opened.borrow(),
            vec!["https://www.youtube.com/watch?v=abc123".to_string()]
        );
    }

    #[test]
    fn 許可しないスキームの新規ウィンドウ要求は何も開かない() {
        let opened: RefCell<Vec<String>> = RefCell::new(Vec::new());
        let url = parse("javascript:alert(1)");

        let called = open_if_openable(&url, |u| opened.borrow_mut().push(u.to_string()));

        assert!(!called);
        assert!(opened.borrow().is_empty());
    }
}

/// 複数の候補エレメント名のうち1つでも `probe` が true を返せば true。
/// サブプロセス実行（副作用）を関数として注入することでテスト容易にする。
/// 呼び出し元（`gst-inspect-1.0` を実行する副作用部分）は後続の実装ステップで配線するため、
/// 現時点ではこのモジュール内から直接呼ばれない。
#[allow(dead_code)]
pub fn detect_codec_support(candidates: &[&str], probe: impl Fn(&str) -> bool) -> bool {
    candidates.iter().any(|&name| probe(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 候補が空なら_falseを返す() {
        assert!(!detect_codec_support(&[], |_| true));
    }

    #[test]
    fn 候補全てでprobeがfalseなら_falseを返す() {
        assert!(!detect_codec_support(&["a", "b", "c"], |_| false));
    }

    #[test]
    fn 先頭の候補でprobeがtrueなら_trueを返す() {
        assert!(detect_codec_support(&["a", "b", "c"], |name| name == "a"));
    }

    #[test]
    fn 末尾の候補でprobeがtrueなら_trueを返す() {
        assert!(detect_codec_support(&["a", "b", "c"], |name| name == "c"));
    }

    #[test]
    fn 候補全てでprobeがtrueなら_trueを返す() {
        assert!(detect_codec_support(&["a", "b", "c"], |_| true));
    }
}

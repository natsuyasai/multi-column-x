//! AppImage 実行時、Cisco OpenH264 ダウンロード先ディレクトリを LD_LIBRARY_PATH に
//! 含めた状態でプロセスを起動し直す（動的リンカが LD_LIBRARY_PATH を解釈するのは
//! プロセス起動時の一度きりのため、後から std::env::set_var しても dlopen に反映されない）。

use std::path::{Path, PathBuf};

/// 無限ループ防止用の再実行済みフラグ。
const REEXEC_GUARD_ENV: &str = "MULTI_COLUMN_X_LD_PATH_PRIMED";

/// XDG Base Directory仕様に基づき、アプリのデータディレクトリを計算する（純粋関数）。
/// `tauri::Manager::path().app_data_dir()` と同じ規則（$XDG_DATA_HOME、無ければ
/// $HOME/.local/share 配下にアプリ識別子のディレクトリ）だが、Tauri の App を構築する
/// 前（`run()` の冒頭）に呼べるよう独立実装する。
pub(crate) fn compute_app_data_dir(xdg_data_home: Option<&str>, home: Option<&str>) -> PathBuf {
    let base = xdg_data_home
        .map(PathBuf::from)
        .or_else(|| home.map(|h| PathBuf::from(h).join(".local/share")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("com.natsuyasai.multicolumnx")
}

fn linux_app_data_dir() -> PathBuf {
    compute_app_data_dir(
        std::env::var("XDG_DATA_HOME").ok().as_deref(),
        std::env::var("HOME").ok().as_deref(),
    )
}

/// ダウンロード済み libopenh264.so.7 の配置先ディレクトリ。
/// H.264ダウンロードコマンド（別ステップで実装）の保存先ディレクトリと必ず一致させること。
pub(crate) fn openh264_lib_dir() -> PathBuf {
    linux_app_data_dir().join("gstreamer-openh264")
}

/// 既存のLD_LIBRARY_PATHの先頭に dir を追加した新しい値を構築する（純粋関数）。
pub(crate) fn build_ld_library_path(dir: &Path, existing: &str) -> String {
    let dir_str = dir.to_string_lossy();
    if existing.is_empty() {
        dir_str.into_owned()
    } else {
        format!("{dir_str}:{existing}")
    }
}

/// openh264ダウンロード先ディレクトリを LD_LIBRARY_PATH に含めた状態で
/// 自分自身を再実行する。既に再実行済み（環境変数で判定）なら何もしない。
/// ディレクトリ作成や再実行に失敗しても、ログを残して処理を継続する
/// （H.264が使えないだけで、アプリ自体は起動できるべきため）。
pub(crate) fn ensure_openh264_ld_library_path() {
    if std::env::var_os(REEXEC_GUARD_ENV).is_some() {
        return;
    }
    let dir = openh264_lib_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        warn_before_logger_ready(&format!(
            "openh264ライブラリディレクトリの作成に失敗しました: {e}"
        ));
        return;
    }
    let existing = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
    let new_value = build_ld_library_path(&dir, &existing);

    let current_exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            warn_before_logger_ready(&format!("current_exeの取得に失敗しました: {e}"));
            return;
        }
    };
    let args: Vec<_> = std::env::args_os().skip(1).collect();

    use std::os::unix::process::CommandExt;
    let err = std::process::Command::new(current_exe)
        .args(args)
        .env(REEXEC_GUARD_ENV, "1")
        .env("LD_LIBRARY_PATH", new_value)
        .exec(); // 成功時はプロセスが置き換わりここには戻らない
    warn_before_logger_ready(&format!(
        "自己再実行に失敗しました。H.264ダウンロード機能が動作しない可能性があります: {err}"
    ));
}

/// この関数は `tauri::Builder::default()` より前（`tauri_plugin_log` 初期化前）に
/// 実行されるため、`log::warn!` を呼んでもロガー未登録で出力が失われる。
/// `log::warn!` と標準エラー出力の両方に書き出すことで、ログプラグイン初期化後に
/// ログファイルへ残る場合にも、初期化前で標準エラーしか見えない場合にも対応する。
fn warn_before_logger_ready(message: &str) {
    log::warn!("{message}");
    eprintln!("[linux_codec_env] {message}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xdg_data_homeが指定されている場合はそれを優先して使う() {
        let result = compute_app_data_dir(Some("/custom/xdg"), Some("/home/user"));
        assert_eq!(
            result,
            PathBuf::from("/custom/xdg/com.natsuyasai.multicolumnx")
        );
    }

    #[test]
    fn xdg_data_homeがnoneでhomeがある場合はhome_local_shareを使う() {
        let result = compute_app_data_dir(None, Some("/home/user"));
        assert_eq!(
            result,
            PathBuf::from("/home/user/.local/share/com.natsuyasai.multicolumnx")
        );
    }

    #[test]
    fn 両方noneの場合はカレントディレクトリ相対にフォールバックする() {
        let result = compute_app_data_dir(None, None);
        assert_eq!(result, PathBuf::from("./com.natsuyasai.multicolumnx"));
    }

    #[test]
    fn build_ld_library_pathは既存が空文字列の場合はdirのみを返す() {
        let dir = PathBuf::from("/opt/app/gstreamer-openh264");
        let result = build_ld_library_path(&dir, "");
        assert_eq!(result, "/opt/app/gstreamer-openh264");
    }

    #[test]
    fn build_ld_library_pathは既存がある場合はコロン結合する() {
        let dir = PathBuf::from("/opt/app/gstreamer-openh264");
        let result = build_ld_library_path(&dir, "/usr/lib:/usr/lib64");
        assert_eq!(result, "/opt/app/gstreamer-openh264:/usr/lib:/usr/lib64");
    }

    #[test]
    fn openh264_lib_dirはlinux_app_data_dir配下のgstreamer_openh264になっている() {
        let result = openh264_lib_dir();
        assert!(result.ends_with("gstreamer-openh264"));
        assert!(result
            .to_string_lossy()
            .contains("com.natsuyasai.multicolumnx"));
    }
}

//! AppImage 実行時、Cisco OpenH264 ダウンロード先ディレクトリを LD_LIBRARY_PATH に
//! 含めた状態でプロセスを起動し直す（動的リンカが LD_LIBRARY_PATH を解釈するのは
//! プロセス起動時の一度きりのため、後から std::env::set_var しても dlopen に反映されない）。

use std::path::{Path, PathBuf};

use crate::commands::settings_file::SETTINGS_FILE;

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

/// AppImage 内のオプションプラグイン置き場（linuxdeploy の依存解決対象外）。
pub(crate) const OPTIONAL_PLUGIN_SUBDIR: &str = "usr/share/multicolumnx/gst-optional/plugins";

/// HW デコード無効時にランクを NONE にするデコーダ要素名。
pub(crate) const HW_VIDEO_DECODERS: &[&str] = &[
    "vah264dec",
    "vah265dec",
    "vavp8dec",
    "vavp9dec",
    "vaav1dec",
    "vampeg2dec",
    "vajpegdec",
    "vaapih264dec",
    "vaapih265dec",
    "vaapivp8dec",
    "vaapivp9dec",
    "vaapiav1dec",
    "vaapimpeg2dec",
    "vaapijpegdec",
    "vaapidecodebin",
    "nvh264dec",
    "nvh265dec",
    "nvvp8dec",
    "nvvp9dec",
    "nvav1dec",
    "v4l2slh264dec",
    "v4l2slh265dec",
    "v4l2slvp8dec",
    "v4l2slvp9dec",
];

/// 既存の GST_PLUGIN_PATH_1_0 に dir を末尾追加する（既に含まれていればそのまま返す＝冪等）。
pub(crate) fn append_plugin_path(existing: &str, dir: &Path) -> String {
    let dir_str = dir.to_string_lossy();
    if existing.split(':').any(|entry| entry == dir_str) {
        return existing.to_string();
    }
    if existing.is_empty() {
        dir_str.into_owned()
    } else {
        format!("{existing}:{dir_str}")
    }
}

/// 既存 GST_PLUGIN_FEATURE_RANK から HW_VIDEO_DECODERS のエントリを常に取り除き、
/// 無効なら "<name>:NONE" 群を付け直した値を返す。結果が空なら None（＝変数を削除）。
/// relaunch で前回の値が継承されても、有効へ戻した設定が効くようにするため。
pub(crate) fn hw_decode_rank_override(enabled: bool, existing: &str) -> Option<String> {
    let mut entries: Vec<String> = existing
        .split(',')
        .filter(|entry| !entry.is_empty())
        .filter(|entry| {
            let name = entry.split(':').next().unwrap_or("");
            !HW_VIDEO_DECODERS.contains(&name)
        })
        .map(str::to_string)
        .collect();
    if !enabled {
        entries.extend(HW_VIDEO_DECODERS.iter().map(|name| format!("{name}:NONE")));
    }
    if entries.is_empty() {
        None
    } else {
        Some(entries.join(","))
    }
}

/// AppImage の展開先（APPDIR）配下のオプションプラグイン置き場。
pub(crate) fn optional_plugin_dir(appdir: &Path) -> PathBuf {
    appdir.join(OPTIONAL_PLUGIN_SUBDIR)
}

/// settings.json 文字列から appSettings.globalSettings.hardwareVideoDecodeEnabled を読む。
/// 不正 JSON・キー欠落・非 bool は true（既定=有効）。
pub(crate) fn read_hw_decode_enabled(settings_json: &str) -> bool {
    let Ok(root) = serde_json::from_str::<serde_json::Value>(settings_json) else {
        return true;
    };
    root.pointer("/appSettings/globalSettings/hardwareVideoDecodeEnabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true)
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

/// Tauri 構築前（WebKit の WebProcess 起動前）に GStreamer 用環境変数を整える。
/// 子プロセス（WebKitWebProcess）は起動時の環境を継承するため、ここでの set_var が反映される。
/// 再実行（exec）後のプロセスで呼ぶこと。再実行で環境変数が継承されても冪等になるよう、
/// プラグインパスは重複追加せず、ランクは HW デコーダのエントリを毎回取り除いてから付け直す。
pub(crate) fn configure_gstreamer_env() {
    if let Some(appdir) = std::env::var_os("APPDIR") {
        let dir = optional_plugin_dir(Path::new(&appdir));
        let existing = std::env::var("GST_PLUGIN_PATH_1_0").unwrap_or_default();
        std::env::set_var("GST_PLUGIN_PATH_1_0", append_plugin_path(&existing, &dir));
    }
    let settings =
        std::fs::read_to_string(linux_app_data_dir().join(SETTINGS_FILE)).unwrap_or_default();
    let existing_rank = std::env::var("GST_PLUGIN_FEATURE_RANK").unwrap_or_default();
    match hw_decode_rank_override(read_hw_decode_enabled(&settings), &existing_rank) {
        Some(value) => std::env::set_var("GST_PLUGIN_FEATURE_RANK", value),
        None => std::env::remove_var("GST_PLUGIN_FEATURE_RANK"),
    }
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

    #[test]
    fn append_plugin_pathは既存が空ならdirのみを返す() {
        let dir = PathBuf::from("/tmp/appdir/plugins");
        let result = append_plugin_path("", &dir);
        assert_eq!(result, "/tmp/appdir/plugins");
    }

    #[test]
    fn append_plugin_pathは既存があればコロン結合で末尾に追加する() {
        let dir = PathBuf::from("/tmp/appdir/plugins");
        let result = append_plugin_path("/usr/lib/gst:/opt/gst", &dir);
        assert_eq!(result, "/usr/lib/gst:/opt/gst:/tmp/appdir/plugins");
    }

    #[test]
    fn append_plugin_pathは既に含まれていれば重複追加しない() {
        let dir = PathBuf::from("/tmp/appdir/plugins");
        let result = append_plugin_path("/usr/lib/gst:/tmp/appdir/plugins", &dir);
        assert_eq!(result, "/usr/lib/gst:/tmp/appdir/plugins");
    }

    #[test]
    fn hw_decode_rank_overrideは有効で既存が空ならnoneを返す() {
        assert_eq!(hw_decode_rank_override(true, ""), None);
    }

    #[test]
    fn hw_decode_rank_overrideは無効なら全hwデコーダをnoneで返す() {
        let result = hw_decode_rank_override(false, "").expect("無効時は値が返る");
        let entries: Vec<&str> = result.split(',').collect();
        assert_eq!(entries.len(), HW_VIDEO_DECODERS.len());
        for name in HW_VIDEO_DECODERS {
            let expected = format!("{name}:NONE");
            assert!(entries.contains(&expected.as_str()), "{expected} が無い");
        }
    }

    #[test]
    fn hw_decode_rank_overrideは有効で継承したhwデコーダのnoneエントリは取り除く() {
        let inherited = "vah264dec:NONE,nvh264dec:NONE";
        assert_eq!(hw_decode_rank_override(true, inherited), None);
    }

    #[test]
    fn hw_decode_rank_overrideはユーザー独自のエントリを保持する() {
        let existing = "myplugin:PRIMARY,vah264dec:NONE,other:SECONDARY";
        let enabled = hw_decode_rank_override(true, existing);
        assert_eq!(enabled.as_deref(), Some("myplugin:PRIMARY,other:SECONDARY"));

        let disabled = hw_decode_rank_override(false, existing).expect("無効時は値が返る");
        let entries: Vec<&str> = disabled.split(',').collect();
        assert!(entries.contains(&"myplugin:PRIMARY"));
        assert!(entries.contains(&"other:SECONDARY"));
        assert!(entries.contains(&"vah264dec:NONE"));
        assert_eq!(entries.len(), HW_VIDEO_DECODERS.len() + 2);
    }

    #[test]
    fn hw_decode_rank_overrideは無効を2回適用しても重複しない() {
        let first = hw_decode_rank_override(false, "myplugin:PRIMARY").expect("無効時は値が返る");
        let second = hw_decode_rank_override(false, &first).expect("無効時は値が返る");
        assert_eq!(first, second);
    }

    #[test]
    fn read_hw_decode_enabledはfalseが保存されていればfalse() {
        let json = r#"{"appSettings":{"globalSettings":{"hardwareVideoDecodeEnabled":false}}}"#;
        assert!(!read_hw_decode_enabled(json));
    }

    #[test]
    fn read_hw_decode_enabledはキーが無ければtrue() {
        let json = r#"{"appSettings":{"globalSettings":{"otherKey":1}}}"#;
        assert!(read_hw_decode_enabled(json));
        assert!(read_hw_decode_enabled("{}"));
    }

    #[test]
    fn read_hw_decode_enabledは壊れたjsonならtrue() {
        assert!(read_hw_decode_enabled(r#"{"appSettings":{"acc"#));
        assert!(read_hw_decode_enabled(""));
    }

    #[test]
    fn optional_plugin_dirはappdir配下のオプションプラグイン置き場を返す() {
        let result = optional_plugin_dir(Path::new("/tmp/.mount_abc"));
        assert_eq!(
            result,
            PathBuf::from("/tmp/.mount_abc/usr/share/multicolumnx/gst-optional/plugins")
        );
    }
}

#[cfg(test)]
mod properties {
    use super::*;
    use proptest::prelude::*;

    /// コロン区切りエントリ（1〜8文字のパス風文字列）を 0〜5 個持つ生成戦略。
    fn path_entries() -> impl Strategy<Value = Vec<String>> {
        prop::collection::vec("[a-z/]{1,8}", 0..=5)
    }

    /// `name:RANK` 形式のエントリ。name はユーザー名と HW デコーダ名の両方を混ぜる。
    fn rank_entry() -> impl Strategy<Value = (String, String)> {
        let name = prop_oneof![
            "[a-z0-9_]{1,10}",
            prop::sample::select(HW_VIDEO_DECODERS.to_vec()).prop_map(str::to_string),
        ];
        let rank = prop_oneof![
            Just("NONE".to_string()),
            Just("PRIMARY".to_string()),
            Just("SECONDARY".to_string()),
            Just("MARGINAL".to_string()),
            "[0-9]{1,3}",
        ];
        (name, rank)
    }

    fn rank_entries() -> impl Strategy<Value = Vec<(String, String)>> {
        prop::collection::vec(rank_entry(), 0..=8)
    }

    fn join_ranks(entries: &[(String, String)]) -> String {
        entries
            .iter()
            .map(|(name, rank)| format!("{name}:{rank}"))
            .collect::<Vec<_>>()
            .join(",")
    }

    fn is_hw_name(name: &str) -> bool {
        HW_VIDEO_DECODERS.contains(&name)
    }

    fn split_entries(value: &str) -> Vec<&str> {
        value.split(',').filter(|e| !e.is_empty()).collect()
    }

    fn entry_name(entry: &str) -> &str {
        entry.split(':').next().unwrap_or("")
    }

    proptest! {
        /// relaunch で環境変数が継承されても、2回適用した結果は1回適用した結果と同じ。
        #[test]
        fn append_plugin_pathは何度適用しても結果が変わらない(
            existing in path_entries(),
            dir in "[a-z/]{1,8}",
        ) {
            let existing = existing.join(":");
            let path = Path::new(&dir);
            let once = append_plugin_path(&existing, path);
            let twice = append_plugin_path(&once, path);
            prop_assert_eq!(once, twice);
        }

        /// 結果のコロン区切りエントリには必ず dir が含まれる。
        #[test]
        fn append_plugin_pathの結果には必ずdirがエントリとして含まれる(
            existing in path_entries(),
            dir in "[a-z/]{1,8}",
        ) {
            let existing = existing.join(":");
            let result = append_plugin_path(&existing, Path::new(&dir));
            prop_assert!(result.split(':').any(|entry| entry == dir));
        }

        /// dir が既存に無ければ、既存のエントリ順を保ったまま末尾に dir だけが追加される。
        #[test]
        fn append_plugin_pathはdirが未登録なら既存の順序を保って末尾に追加する(
            existing in path_entries(),
            dir in "[a-z/]{1,8}",
        ) {
            prop_assume!(!existing.contains(&dir));
            let joined = existing.join(":");
            let result = append_plugin_path(&joined, Path::new(&dir));
            prop_assert!(result.starts_with(&joined));
            let result_entries: Vec<&str> = result.split(':').collect();
            let mut expected: Vec<&str> = existing.iter().map(String::as_str).collect();
            expected.push(&dir);
            prop_assert_eq!(result_entries, expected);
        }

        /// 出力（None なら空文字）を同じ enabled で再適用しても同じ結果になる。
        #[test]
        fn hw_decode_rank_overrideは同じ設定を再適用しても結果が変わらない(
            enabled in any::<bool>(),
            existing in rank_entries(),
        ) {
            let existing = join_ranks(&existing);
            let once = hw_decode_rank_override(enabled, &existing);
            let twice = hw_decode_rank_override(enabled, once.as_deref().unwrap_or_default());
            prop_assert_eq!(once, twice);
        }

        /// 有効なら、結果に HW デコーダ名のエントリは一つも残らない。
        #[test]
        fn hw_decode_rank_overrideは有効ならhwデコーダ名のエントリを含まない(
            existing in rank_entries(),
        ) {
            let existing = join_ranks(&existing);
            let result = hw_decode_rank_override(true, &existing).unwrap_or_default();
            for entry in split_entries(&result) {
                prop_assert!(!is_hw_name(entry_name(entry)), "{entry} が残っている");
            }
        }

        /// 無効なら、HW デコーダの全名前が `名前:NONE` として結果に含まれる。
        #[test]
        fn hw_decode_rank_overrideは無効なら全hwデコーダがnoneで含まれる(
            existing in rank_entries(),
        ) {
            let existing = join_ranks(&existing);
            let result = hw_decode_rank_override(false, &existing).expect("無効時は値が返る");
            let entries = split_entries(&result);
            for name in HW_VIDEO_DECODERS {
                let expected = format!("{name}:NONE");
                prop_assert!(entries.contains(&expected.as_str()), "{expected} が無い");
            }
        }

        /// HW デコーダ名でないユーザー独自エントリは、enabled によらず順序込みで保持される。
        #[test]
        fn hw_decode_rank_overrideはユーザー独自エントリをenabledによらず順序込みで保持する(
            enabled in any::<bool>(),
            existing in rank_entries(),
        ) {
            let expected: Vec<String> = existing
                .iter()
                .filter(|(name, _)| !is_hw_name(name))
                .map(|(name, rank)| format!("{name}:{rank}"))
                .collect();
            let result = hw_decode_rank_override(enabled, &join_ranks(&existing))
                .unwrap_or_default();
            let kept: Vec<String> = split_entries(&result)
                .into_iter()
                .filter(|entry| !is_hw_name(entry_name(entry)))
                .map(str::to_string)
                .collect();
            prop_assert_eq!(kept, expected);
        }

        /// 無効化してから有効へ戻した結果は、最初から有効にした結果と同じ。
        #[test]
        fn hw_decode_rank_overrideは無効から有効へ戻すと最初から有効にした結果と一致する(
            existing in rank_entries(),
        ) {
            let existing = join_ranks(&existing);
            let disabled = hw_decode_rank_override(false, &existing).unwrap_or_default();
            prop_assert_eq!(
                hw_decode_rank_override(true, &disabled),
                hw_decode_rank_override(true, &existing)
            );
        }

        /// 任意の文字列を与えても panic せず bool を返す。
        #[test]
        fn read_hw_decode_enabledは任意の文字列でもpanicしない(input in any::<String>()) {
            let _: bool = read_hw_decode_enabled(&input);
        }

        /// 保存した bool がそのまま読み出される（ラウンドトリップ）。
        #[test]
        fn read_hw_decode_enabledは保存した値をそのまま読み出す(value in any::<bool>()) {
            let json = serde_json::json!({
                "appSettings": { "globalSettings": { "hardwareVideoDecodeEnabled": value } }
            })
            .to_string();
            prop_assert_eq!(read_hw_decode_enabled(&json), value);
        }
    }
}

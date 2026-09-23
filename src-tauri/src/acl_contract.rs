// src-tauri/src/acl_contract.rs
//
// アプリ独自 IPC コマンドの ACL（capability）契約テスト。
// build.rs で AppManifest::commands に列挙したコマンド一覧と、
// src-tauri/capabilities/*.json の許可設定が、
// lib.rs の generate_handler! に登録された全コマンドと矛盾していないかを検証する。

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    /// lib.rs の `tauri::generate_handler![ ... ]` に登録されているコマンド関数名を抽出する。
    /// `commands::xxx::yyy,` 形式の各行から、最後の `::` 以降（関数名）だけを取り出す。
    /// `#[cfg(...)]` 等の属性行やコメント行は無視する。
    fn commands_registered_in_generate_handler() -> Vec<String> {
        let lib_src = include_str!("lib.rs");
        let marker = "tauri::generate_handler![";
        let start = lib_src
            .find(marker)
            .expect("generate_handler! が lib.rs に見つからない")
            + marker.len();
        let end = lib_src[start..]
            .find("])")
            .expect("generate_handler! の閉じ括弧が見つからない")
            + start;
        let body = &lib_src[start..end];

        body.lines()
            .filter_map(|line| {
                let line = line.trim();
                if line.is_empty() || line.starts_with("//") || line.starts_with('#') {
                    return None;
                }
                let line = line.trim_end_matches(',');
                line.rsplit("::").next().map(|s| s.trim().to_string())
            })
            .filter(|s| !s.is_empty())
            .collect()
    }

    /// build.rs の `AppManifest::new().commands(&[ ... ])` に列挙された文字列リテラルを抽出する。
    fn commands_declared_in_build_rs() -> Vec<String> {
        let build_src = include_str!("../build.rs");
        let marker = ".commands(&[";
        let start = build_src
            .find(marker)
            .expect(".commands(&[ が build.rs に見つからない")
            + marker.len();
        let end = build_src[start..]
            .find("])")
            .expect("commands(&[...]) の閉じ括弧が build.rs に見つからない")
            + start;

        // コメント行はコンマ区切りの前に取り除く（コメント行と次のリテラルが同じ
        // カンマ区切り片に混ざり、リテラルごと除外されてしまうのを防ぐため）。
        let body_without_comment_lines: String = build_src[start..end]
            .lines()
            .filter(|line| !line.trim().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        body_without_comment_lines
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.trim_matches('"').to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }

    /// capabilities/*.json の `permissions` 配列に含まれる、
    /// アプリ独自コマンドの許可（`allow-xxxx-yyyy` 形式で `:` を含まないもの）を集める。
    /// core:* / shell:* / store:* 等のプラグイン権限（`:` を含む識別子）は対象外。
    fn app_command_permissions_in_all_capabilities() -> BTreeSet<String> {
        let files = [
            include_str!("../capabilities/default.json"),
            include_str!("../capabilities/updater.json"),
            include_str!("../capabilities/column-webview.json"),
        ];

        let mut result = BTreeSet::new();
        for content in files {
            let json: serde_json::Value =
                serde_json::from_str(content).expect("capability JSON のパースに失敗した");
            let permissions = json["permissions"]
                .as_array()
                .expect("permissions 配列が見つからない");
            for permission in permissions {
                let permission = permission.as_str().unwrap().to_string();
                if permission.starts_with("allow-") && !permission.contains(':') {
                    result.insert(permission);
                }
            }
        }
        result
    }

    /// column-webview.json の `permissions` 配列に含まれるアプリ独自コマンドの許可だけを集める。
    fn app_command_permissions_in_column_webview() -> BTreeSet<String> {
        let json: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/column-webview.json"))
                .expect("column-webview.json のパースに失敗した");
        json["permissions"]
            .as_array()
            .expect("permissions 配列が見つからない")
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .filter(|s| s.starts_with("allow-") && !s.contains(':'))
            .collect()
    }

    /// コマンド名（snake_case）を Tauri の自動生成権限 ID（`allow-<kebab-case>`）に変換する。
    fn to_allow_permission(command: &str) -> String {
        format!("allow-{}", command.replace('_', "-"))
    }

    #[test]
    fn libに登録された全コマンドがビルドスクリプトのapp_manifestに列挙されている() {
        let registered = commands_registered_in_generate_handler();
        assert!(
            !registered.is_empty(),
            "generate_handler! からコマンドを抽出できなかった"
        );
        let declared: BTreeSet<String> = commands_declared_in_build_rs().into_iter().collect();

        let missing: Vec<&String> = registered
            .iter()
            .filter(|cmd| !declared.contains(*cmd))
            .collect();
        assert!(
            missing.is_empty(),
            "build.rs の app_manifest に列挙されていないコマンドがある: {missing:?}"
        );
    }

    #[test]
    fn libに登録された全コマンドがいずれかのcapabilityで許可されている() {
        let registered: BTreeSet<String> = commands_registered_in_generate_handler()
            .into_iter()
            .collect();
        let expected_permissions: BTreeSet<String> = registered
            .iter()
            .map(|cmd| to_allow_permission(cmd))
            .collect();
        let actual_permissions = app_command_permissions_in_all_capabilities();

        let missing: Vec<&String> = expected_permissions
            .difference(&actual_permissions)
            .collect();
        assert!(
            missing.is_empty(),
            "どの capability でも許可されていないコマンド権限がある: {missing:?}"
        );

        // 登録されていないコマンドの権限が capability に残っていないか（削除漏れ検知）。
        let stale: Vec<&String> = actual_permissions
            .difference(&expected_permissions)
            .collect();
        assert!(
            stale.is_empty(),
            "generate_handler! に存在しないコマンドの許可が capability に残っている（削除漏れ）: {stale:?}"
        );
    }

    #[test]
    fn x上のページ向けcapabilityにはinjectが使うコマンドだけが許可されている() {
        // src-tauri/src/inject/_src/ 配下で invoke() されているコマンドのみを列挙する。
        // （context_menu.ts / image_popup.ts / popup_toolbar.ts / video_long_press_menu.ts /
        //   scroll_event.ts / auto_reload.ts / keyboard_shortcut.ts / api_rate_limit_monitor.ts を
        //   grep して確認済み）
        let expected_commands = [
            "open_popup_window",
            "open_link_popup_window",
            "close_popup_window",
            "switch_popup_session",
            "report_webview_scroll",
            "report_new_posts_count",
            "report_official_settings",
            "report_api_rate_limit",
            "report_keyboard_shortcut",
            "download_video",
        ];
        let expected_permissions: BTreeSet<String> = expected_commands
            .iter()
            .map(|cmd| to_allow_permission(cmd))
            .collect();

        let actual_permissions = app_command_permissions_in_column_webview();

        assert_eq!(
            expected_permissions, actual_permissions,
            "column-webview.json のアプリコマンド許可が inject の利用コマンドと一致しない"
        );
    }

    #[test]
    fn x以外のサイト向けのremote設定を持つcapabilityが存在しない() {
        let files = [
            ("default.json", include_str!("../capabilities/default.json")),
            ("updater.json", include_str!("../capabilities/updater.json")),
            (
                "column-webview.json",
                include_str!("../capabilities/column-webview.json"),
            ),
        ];
        let allowed_prefixes = [
            "https://x.com/",
            "https://*.x.com/",
            "https://twitter.com/",
            "https://*.twitter.com/",
        ];

        for (name, content) in files {
            let json: serde_json::Value =
                serde_json::from_str(content).expect("capability JSON のパースに失敗した");
            if let Some(urls) = json["remote"]["urls"].as_array() {
                for url in urls {
                    let url = url.as_str().unwrap();
                    assert!(
                        allowed_prefixes
                            .iter()
                            .any(|prefix| url.starts_with(prefix)),
                        "{name} に x.com / twitter.com 以外の remote url がある: {url}"
                    );
                }
            }
        }
    }

    #[test]
    fn メインウィンドウ向けcapabilityはremoteを持たずlocalのみに適用される() {
        for (name, content) in [
            ("default.json", include_str!("../capabilities/default.json")),
            ("updater.json", include_str!("../capabilities/updater.json")),
        ] {
            let json: serde_json::Value =
                serde_json::from_str(content).expect("capability JSON のパースに失敗した");
            assert!(
                json.get("remote").is_none(),
                "{name} は local のみに適用されるべきだが remote 設定を持っている"
            );
        }
    }
}

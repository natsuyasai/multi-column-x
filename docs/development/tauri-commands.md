# Tauri コマンド一覧

アプリ独自の Tauri コマンドと説明。

| コマンド                             | 説明                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `load_settings`                      | 設定ファイルの読み込み                                                                                                       |
| `save_settings`                      | 設定ファイルへの書き込み                                                                                                     |
| `export_backup`                      | 現在の設定をバックアップファイル（`.mcxbackup.json`）として書き出す（保存ダイアログ / Android は SAF。呼び出し元 main 限定） |
| `read_backup`                        | バックアップファイルを選択して検証する（ストアには触れない。呼び出し元 main 限定）                                           |
| `apply_restore`                      | 現在の設定を退避してからカラムと設定を置換し、アトミックに保存する（呼び出し元 main 限定）                                   |
| `detect_account_user_ids`            | X ユーザー ID 未設定の既存アカウントの `twid` Cookie から ID を後追いで取得する（呼び出し元 main 限定）                      |
| `create_column_webview`              | カラム WebView の作成                                                                                                        |
| `get_external_column_data_directory` | 外部 URL カラム（アカウント非依存）のデータ保存先ディレクトリを取得                                                          |
| `delete_external_column_data`        | 外部 URL カラムの保存先データディレクトリを削除                                                                              |
| `remove_column_webview`              | カラム WebView の削除                                                                                                        |
| `resize_column_webview`              | カラム WebView のリサイズ・移動                                                                                              |
| `open_popup_window`                  | メディアポップアップを開く                                                                                                   |
| `open_link_popup_window`             | 任意 URL のリンクポップアップを開く                                                                                          |
| `close_popup_window`                 | ポップアップを閉じる                                                                                                         |
| `switch_popup_session`               | ポップアップのアカウントを切り替え（ウィンドウ再作成）                                                                       |
| `eval_in_webview`                    | 指定 WebView で JS を評価                                                                                                    |
| `report_webview_scroll`              | WebView からの横スクロールを main に中継                                                                                     |
| `report_new_posts_count`             | カラムの新着投稿数を main WebView に中継                                                                                     |
| `report_official_settings`           | X 公式の表示設定変更を配布先カラムへ中継                                                                                     |
| `report_api_rate_limit`              | inject が検出した X 内部 API のレート制限ヘッダを main へ中継                                                                |
| `report_keyboard_shortcut`           | inject から検出したキーボードショートカットを中継                                                                            |
| `get_mobile_insets`                  | Android システム UI のインセット（ノッチ等）を取得                                                                           |
| `set_column_cookies`                 | カラム WebView に Cookie を設定（Android）                                                                                   |
| `is_webview_profile_supported`       | Android の WebView Profile API 対応可否を判定（複数カラム同時表示の可否判定に使用）                                          |
| `update_mobile_swipe_bar`            | モバイルのスワイプ切替バー設定（高さ・透過度等）を反映                                                                       |
| `flash_mobile_swipe_bar`             | モバイルのスワイプ切替バーを一時的に表示                                                                                     |
| `open_add_account_window`            | アカウント追加ウィンドウを開く（ログイン検出付き）                                                                           |
| `reauth_account_window`              | 既存アカウントの再認証ウィンドウを開く                                                                                       |
| `delete_account_data`                | アカウントデータディレクトリを削除                                                                                           |
| `close_window`                       | 指定ラベルのウィンドウ / WebView を閉じる                                                                                    |
| `open_compose_window`                | ツイート作成ウィンドウを開く                                                                                                 |
| `install_apk_update`                 | APK をダウンロードしてインストーラを起動（Android。呼び出し元 main 限定・URL 許可リスト・SHA-256 検証付き）                  |
| `check_media_codec_support`          | Linux AppImage でのメディアコーデック（H.264/AAC）対応状況を判定                                                             |
| `download_and_enable_h264`           | Cisco OpenH264 ランタイムをダウンロードして有効化（デスクトップ Linux のみ）                                                 |
| `download_video`                     | カラム上の動画をダウンロード（デスクトップのみ。Android は別経路でネイティブ実装）                                           |

**新しいコマンドを `lib.rs` の `generate_handler!` に追加したら、`src-tauri/build.rs` の `AppManifest::commands` と、呼び出し元に応じた `src-tauri/capabilities/*.json` の許可（`allow-<コマンド名のケバブケース>`）を必ず同時に更新すること。** アプリ独自コマンドは ACL（capability）の対象であり、どの capability にも許可されていないコマンドは main を含む全 WebView から "not allowed by ACL" として拒否される（`src-tauri/src/acl_contract.rs` の契約テストが漏れを検知する）。

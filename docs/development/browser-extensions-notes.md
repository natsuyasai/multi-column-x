# ブラウザ拡張機能（Chrome 拡張）ノート

カラム WebView（WebView2）に Chrome 拡張機能を読み込み・管理する機能に関する設計判断・不採用案・落とし穴を記録する。**対象は Windows デスクトップのみ。** 手動テスト項目は `docs/development/browser-extensions/integration-test.md`。

## 対象ファイル

- Rust（`src-tauri/src/commands/extensions/`）
  - `model.rs` — `ExtensionEntry` / `ExtensionSource` / `ProfileSync` / `AppliedExtension` / `ExtensionsState`
  - `store.rs` — `settings.json` の `browserExtensions` キーの読み書き（`load` / `save`）
  - `manifest.rs` — `manifest.json` の解析（名前の多言語解決、ポップアップ / オプションの有無とパス）
  - `chrome.rs` — Chrome の `Extensions` ルート解決、バージョンフォルダの最新選択、検出（`detect_extensions`）
  - `sanitize.rs` — 拡張フォルダ直下の予約名エントリ検出と除外コピー（`prepare_extension_dir`）
  - `reconcile_plan.rs` — desired state と現状から `Action`（`Add` / `Remove` / `SetEnabled`）を決める純粋ロジック（`plan_profile`）
  - `executor.rs` — `ProfileOps` trait と `apply_actions_with`（Add → Remove → SetEnabled の順に実行、失敗は集約して続行）
  - `hresult.rs` — Add 失敗の HRESULT を人が読める文言にする `describe_add_error`
  - `webview2.rs`（`#[cfg(windows)]`）— `ICoreWebView2Profile7` への非同期ブリッジ。`ProfileOps` の実装 `WebviewOps`
  - `service.rs` — 状態操作・`modify_state` / `lock_state`（直列化）・`reconcile_profile` / `reconcile_webview` / `reconcile_all_live`・`open_extension_page` の検証と URL 組み立て
  - `mod.rs` — Tauri コマンド 8 個と拡張機能ページ用ウィンドウ（`open_page_window`）
- Rust（その他）
  - `commands/webview/column.rs` — `create_column_webview` 末尾の reconcile、builder の `browser_extensions_enabled(true)`
  - `commands/webview/{compose,popup}.rs` — 同フラグ
  - `commands/webview/mod.rs` — フラグ・同期の契約テスト
  - `state.rs` — `WebviewRegistry::distinct_data_directories`
  - `ipc_constants.rs` — `labels::EXTENSION_PREFIX`（`extension-`）
  - `build.rs` / `capabilities/default.json` / `lib.rs` — ACL 3 点セット
- TS: `src/components/AppSettingsPanel/ExtensionsTab.tsx`（+ `.module.scss` / `.stories.tsx` / `.test.tsx`）、`src/lib/extensionsSupport.ts`、`src/services/extensions.ts`、`src/constants/ipc.ts`、`src/types/index.ts`、`src/App.tsx`（`handleExtensionsChanged`）

## 概要と対象 OS

- 拡張機能は **全アカウント共通**。WebView2 は data_directory（= アカウントのプロファイル）ごとに拡張を持つので、アプリが各アカウントのプロファイルへ追加する。
- 導入方法は 2 つ: 展開済みフォルダの指定（`add_extension_from_folder`）と、Chrome の Default プロファイル（`%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\<ID>\<version>\`）からの検出（`detect_chrome_extensions` → `add_chrome_extension`）。
- 管理操作は追加・削除・有効/無効・ポップアップ / オプションページを別ウィンドウで開く。変更後はフロントが全カラムを再読込する。
- **Windows 以外では UI を出さず、コマンドは「この環境では拡張機能に対応していません」を返すスタブ**（`mod.rs` の `ensure_supported`）。コマンド自体は全 OS の `generate_handler!` に登録されている（ACL 契約テストとの整合のため。`lib.rs` で cfg を付けていない）。

### macOS・Linux を見送った調査結果と再検討の条件

- **Linux**: WebKitGTK の拡張機能管理 `WebKitWebExtensionManager` は WebKit 本体の PR #75929 で、2026-10 時点で draft。「読み込みはできるが拡張は未動作」の状態。再検討の条件は、これが本体にマージされ、拡張が実際に動作し、かつ webkit2gtk の Rust バインディング / wry 経由で利用できること。
- **macOS**: `WKWebExtension` は macOS 15.4+ の API で、wry が未対応。再検討の条件は、wry が WKWebExtension を公開し、最低サポートの macOS 要件を満たせること。
- モバイルは WebView の仕組みが別で対象外。

## 設計

### 永続化

- 正本（desired state）は `settings.json`（tauri-plugin-store）の**別キー `browserExtensions`**（`store::STORE_KEY`）。中身は `ExtensionsState { entries, profiles }`。
- **`appSettings` は変更しない**。理由: (1) 拡張機能のパスは端末固有でバックアップに含めたくない（`BackupGlobalSettings` は `GlobalSettingsData` のホワイトリスト出力で、別キーなら影響しない。`apply_restore` も `appSettings` のみ触る）。(2) `GlobalSettingsData` に入れると既定値の 3 箇所同期（Rust / TS / `contracts/default-settings.json`）とバックアップ取捨の判断が発生する。
- 保存は `store.set(...)` → `settings_file::save_store_atomically`（`Store::save` 直呼び禁止）。
- 読み込み時にキーが無い / 壊れた値は空状態にフォールバックする（`state_from_value`）。**壊れた値（キーは在るのにパースできない）は、空状態を返す前に `settings.json` の別キー `browserExtensionsBroken`（`store::BROKEN_KEY`、1 世代のみ・次の破損で上書き）へ退避する**（純粋部分は `split_stored_value`。キー無し・`null`・正常値では退避しない）。

### reconcile（desired state を各プロファイルへ反映）

- `plan_profile` が「エントリの解決済みパス」「保存済みの適用記録（`AppliedExtension`: `applied_path` / `webview_id`）」「WebView2 の現状一覧」から `Action` 列を決める。
  - 適用記録が無い / パスが変わった / 一覧に WebView2 ID が無い → `Add`（旧 ID があれば `replaces` で後から `Remove`）
  - 同じパスで有効状態が違う → `SetEnabled`
  - `missing`（Chrome から消えた・元フォルダが無い）は**無効として扱う**（`enabled` は変えない。復活すれば自動復帰）
  - エントリ一覧から消えたものの適用記録 → `Remove`
  - **アプリが把握していない ID（既定の Microsoft 拡張など）には触れない**
- 実行は `apply_actions_with`（Add → Remove → SetEnabled）。1 件失敗しても続行し、エラーは集約する。`changed` は Add / Remove の成功があったときだけ true（`SetEnabled` のみでは false）。
- 結果は `ProfileSync`（data_directory 単位）へ反映する。アカウントが存在しない data_directory の `ProfileSync` は `prune_state_profiles` で掃除する（アカウント一覧が取れないときは掃除しない）。
- **reconcile のタイミング**
  1. **カラム作成時**: `create_column_webview` 末尾（Windows、`page_type != "external"`）で `tauri::async_runtime::spawn` し、`service::reconcile_webview` を実行。`Ok(true)` のときだけ `webview.reload()`。起動時の Chrome 最新バージョンへの付け替えと、新規アカウントのカラムをこれで賄う。
  2. **変更時**: `add_*` / `set_extension_enabled` / `remove_extension` が `reconcile_all_live` を呼ぶ。稼働中の data_directory 一意集合（`WebviewRegistry::distinct_data_directories`）の代表 WebView それぞれで実行。**アカウントの data_directory だけが対象**（`retain_account_targets`）。個別の失敗は `log::warn!` で続行（次回の reconcile で再試行）。
  3. `open_extension_page` で対象プロファイルに未適用のとき、その data_directory のカラム WebView で先に reconcile する。
- **直列化**: 状態の読み書きと reconcile は 1 つの `tokio::sync::Mutex`（`service::lock_state`）で直列化する。reconcile が古い状態を読んで、直前の追加・削除を上書きで失う競合を防ぐ。同一 data_directory の複数カラムが同時に作られても、2 回目以降は差分ゼロで即終了する。ロック保持中にブロッキング処理をしない（ファイル I/O は `spawn_blocking`）。
- **reload は変更時のみ**: カラム作成時の初回ナビゲーションが拡張追加より先に走るため、Add / Remove があったときだけ再読込する。変更コマンド後の全カラム再読込はフロント側（後述）。

### ポップアップ / オプションページ

- `open_extension_page` は `chrome-extension://<WebView2 の拡張 ID>/<manifest 由来の相対パス>` を `WebviewWindowBuilder`（`WebviewUrl::External`）で別ウィンドウに開く。`data_directory` は引数 `accountId` のアカウントのもの。`accountId` が無い / 空はエラー（先頭アカウントへのフォールバックはしない）。
- URL は Rust 側で組み立て、相対パスの `..` / 絶対 / スキーム付き / `\` を拒否する（`build_extension_url`）。
- ラベルは `extension-<uuid8>`。**`capabilities/*.json` の `windows` に含めない**（リモートコンテンツに IPC を渡さない）。契約テストが `*` やこのプレフィックスの混入を検査する。
- フロント側の `accountId` は `resolveExtensionPageAccountId`（選択中アカウント → 先頭カラムのアカウント → null）。

### フロントエンド

- 設定画面の「拡張機能」タブは `isExtensionsSupported(platformName, isMobile)`（Windows かつ非モバイル）のときだけ表示。
- フォルダ選択ダイアログは Rust 側 `pick_extension_folder` で開く（フロントに dialog 権限を与えない）。
- 変更（追加 / 削除 / 有効無効）の成功後に `onExtensionsChanged` を呼び、`App.tsx` の `handleExtensionsChanged` が全カラムへ `WEBVIEW_SCRIPTS.RELOAD_PAGE`（`location.reload();`）を送る。多重実行は `extensionsReloadingRef` で防ぐ。失敗時は再読込しない。
- 拡張一覧はコンポーネントローカル状態（zustand には入れない）。

## PoC で確認した WebView2 の事実

検証環境: WebView2 154 / Tauri 2.11 / wry 0.55 / webview2-com 0.38.2。

- `WebviewBuilder::browser_extensions_enabled(true)`（`#[cfg(windows)]`）で拡張 API が使える。`with_webview` → `controller.CoreWebView2()` → `cast::<ICoreWebView2_13>()` → `.Profile()` → `cast::<ICoreWebView2Profile7>()` で `AddBrowserExtension` / `GetBrowserExtensions` / `ICoreWebView2BrowserExtension::{Id, Name, IsEnabled, Enable, Remove}` に到達できる。
- Chrome の拡張フォルダは**そのまま**渡せる（`_metadata` / `_locales` 含む）。**拡張フォルダ直下に `_locales` と `_metadata` 以外の `_` 始まりのエントリ（ファイル・空ディレクトリ・中身ありを問わない）があると `E_ACCESSDENIED`**。サブフォルダ内の `_` 始まりは問題ない。
- Add 失敗の HRESULT（`hresult.rs`）:

  | HRESULT      | 意味                                              | 文言                                     |
  | ------------ | ------------------------------------------------- | ---------------------------------------- |
  | `0x80070002` | `manifest.json` が無い                            | 「manifest.json が見つかりません」       |
  | `0x80070005` | 予約名エントリなど（E_ACCESSDENIED）              | 「読み込めないファイルが含まれています」 |
  | `0x80004005` | 存在しないパス / ジャンクション経由パス（E_FAIL） | 「パスを確認してください」               |
  | `0x80070057` | 定義が不正（E_INVALIDARG）                        | 「拡張機能の定義が正しくありません」     |
  | その他       | -                                                 | エラーコードを 8 桁大文字 16 進で含める  |

  `0x80070057` は PoC の確認項目ではなく実装時に文言を割り当てたもの（実機で出る条件は未検証）。

- **ジャンクション経由のパスは Add できない**。実パスを渡す（フォルダ指定は `canonicalize` + `\\?\` 接頭辞除去: `prepare_folder_for_add`）。
- 追加した拡張は data_directory に永続化され、再起動後も一覧に残る。**拡張フォルダごと消すと次回起動時に一覧から静かに消える**。**稼働中に拡張ファイルを書き換えても反映はアプリ再起動後**。
- **追加直後は既に開いているページには効かず、次のナビゲーション（再読込）から効く**。
- **プロファイルごとに独立**。既定の `Microsoft Clipboard Extension` / `Microsoft Edge PDF Viewer` が常に一覧に出る（管理対象外）。
- 一覧から取れるのは Id / Name / IsEnabled のみ（**バージョンや元パスは API から取れない**）。そのためアプリ側で `applied_path` と WebView2 ID の対応を `ProfileSync` に保存する。
- `chrome-extension://<ID>/popup.html` / `options.html` は、同じ data_directory + `browser_extensions_enabled(true)` の独立 `WebviewWindowBuilder` で開ける（`chrome.runtime.id` / `chrome.storage` が動作）。

## 判断記録と不採用案

- **wry の `extensions_path`**: 追加のみで削除・有効化・一覧が無く、完了結果も無視される。
- **アカウントごとに非表示ヘルパー WebView を作って適用する案**: 常駐コストが大きい。カラム作成時の reconcile で足りる。
- **`GlobalSettingsData` に拡張一覧を入れる案**: 既定値 3 箇所同期とバックアップ取捨が発生し、端末固有パスと相性が悪い。
- **外部（`external`）カラムは同期対象外**: アカウントではなく、アカウント非依存の保存先を使うため。ただし builder には（同一 data_directory の環境不一致を避けるため）フラグを付けている。
- Chrome 由来の更新追従は「`Extensions\<ID>` 配下の最新バージョンフォルダを毎回解決し、パスが変われば Add + 旧 ID の Remove」。Chrome 側のファイルは変更しない。
- 予約名を含むフォルダは、元フォルダを変更せず `app_data_dir/extensions/<entryId>/` に除外コピーして読み込む。削除時はコピーだけ消し、元フォルダは残す。シンボリックリンクはコピーせずスキップする。
- 除外コピーは毎回作り直さない。コピー先の外（`copy_root/<entryId>.fingerprint`）に指紋（コピー元の絶対パス + 再帰的な（相対パス, サイズ, 更新時刻）を FNV-1a 64bit で要約した文字列。予約名エントリ・シンボリックリンクは対象外）を保存し、コピー先が在って指紋が一致する間は再コピーしない（WebView2 が読み込み中のフォルダを消さない・巨大フォルダで遅くならない）。不一致または無いときだけ指紋 → コピー先の順に消して作り直し、コピー完了後に指紋を書く。走査時に合計 20,000 ファイル・500MB・深さ 32 を超えると「拡張機能のフォルダが大きすぎます」エラー（`ScanLimits`）。
- フォルダ指定の追加はネットワークフォルダ（UNC。`\\server\share\…`、`\\?\UNC\…`）を拒否する（`service::ensure_local_folder_path`。実パス化の前と後の両方で判定）。
- 追加セクションに「すべてのアカウントの X ページを読み書きできる場合があります。信頼できるものだけを追加してください。」の注意を静的に表示する（`TRUST_NOTICE`）。

## 落とし穴

- **`browser_extensions_enabled(true)` は、アカウントの data_directory を使う全 builder に付ける**（カラム / コンポーズ / ポップアップ / 拡張ページ用ウィンドウ）。同一 data_directory の WebView2 環境はフラグが食い違うと生成に失敗する（`ERROR_INVALID_STATE`）。付け方は `#[cfg(windows)]` の直後に `let builder = builder.browser_extensions_enabled(true);` の 1 行で固定。`commands/webview/mod.rs` の契約テスト（行の完全一致と直前行の `#[cfg(windows)]` を検査）が builder 数との一致を検証する。`extensions/mod.rs` の拡張ページ用ウィンドウは別の文字列検査テスト。
- **`commands/account.rs` の add-account / reauth ウィンドウにはフラグを付けていない**（新規 data_directory のため）。ただし同じ data_directory を後でカラムが使うので、**アカウント追加直後のカラム作成で `ERROR_INVALID_STATE` が出ないかは実機で未確認**（要確認）。
- **新コマンドの ACL 3 点セット**: `build.rs` の `AppManifest`、`capabilities/default.json`、`lib.rs` の `generate_handler!`。`column-webview.json` には**追加しない**（inject が使うコマンド集合と厳密一致検証があるため）。全コマンド先頭で `require_main_caller`。IPC コマンド名は `contracts/ipc-constants.json` と `src/constants/ipc.ts` にも載せる。
- **`save_store_atomically` を使う**（`browserExtensions` キーでも）。
- **WebView2 の完了ハンドラ内・`with_webview` クロージャ内で同期待ち・重い処理をしない**（UI スレッドでデッドロックする）。結果は `oneshot` で async 側へ返し、各呼び出しに 10 秒のタイムアウトを付けている（`webview2.rs` の `CALL_TIMEOUT`）。完了ハンドラの入れ子（`with_extension` が一覧取得の完了ハンドラ内で Remove / Enable を開始する）は実機での動作確認が不十分（要確認）。
- **Chrome の `<ver>` 更新への追従**: バージョンフォルダ名は `1.2.3_0` 形式。`_` 以降を除いて数値セグメント比較し、同一なら suffix の数値で比較（`1.9_0` < `1.10_0`）。同順位は名前の辞書順で決め、入力順に依存させない。
- **全カラム再読込は `location.reload()`（`RELOAD_PAGE`）**。`triggerReload`（既存の再読込手段）では拡張が効かない。
- **Rust テスト名に ASCII 大文字を含めない**（clippy `non_snake_case` が `-D warnings` でエラー）。
- **`include_str!` 契約テストの保守**: ソース文字列を検査するテストがある。
  - `extensions/store.rs` — `save_settings`（`settings.rs`）と `apply_restore`（`backup/mod.rs`）が書き換えるストアキーが `appSettings` だけであること、`STORE_KEY` が `appSettings` と別であること
  - `extensions/mod.rs` — `WebviewWindowBuilder` 数と `external_link::new_window_handler` 数の一致、`.browser_extensions_enabled(true)` の存在、capability の `windows` に `extension-` や `*` が無いこと
  - `commands/webview/mod.rs` — フラグの行・`create_column_webview` の reconcile 位置（レジストリ登録の後で `#[cfg(windows)]` に守られ、`Ok(true)` の後に `.reload()`）

  関数名・文字列・行構成を変えるとテストが落ちる。リファクタ時はテスト側の検査対象文字列も追従させる（文字列の完全一致なので、フォーマッタによる整形変化にも注意）。

- 拡張ページ用ウィンドウにも `.on_new_window(external_link::new_window_handler(app.clone()))` が必要（詳細は [external-link-new-window-notes.md](external-link-new-window-notes.md)）。
- `copy_root`（除外コピーの置き場）が拡張フォルダの内側だと再帰コピーになる。`prepare_extension_dir` は `copy_root` が `source` の内側（正規化後の小文字比較）ならエラーにするが、呼び出し側も `app_data_dir` 配下を渡すこと（`service::copy_root`）。
- 表示名などの解決ロケールは `"ja"` 固定（`service::LOCALE`）。

## テスト方針

- **純粋ロジックは OS 非依存で単体テスト**: `manifest.rs`（名前の多言語解決・パス検証）、`chrome.rs`（tempdir に偽の Chrome ツリーを作る。バージョン比較、`Temp` など ID 以外のフォルダ除外）、`sanitize.rs`（tempdir。元フォルダ不変）、`reconcile_plan.rs`（計画の分岐）、`store.rs`（保存 → 読み込みの往復）、`service.rs`（状態操作・検証・URL 組み立て）。Windows 専用の `webview2.rs` 以外は cfg を付けずにテストする。
- **executor のモック**: `ProfileOps` のモックで Add → Remove → SetEnabled の順序、`replaces` の判定、エラー集約、`changed` の条件を検証する（`executor.rs`、`service.rs` のテストも `reconcile_profile` をモックで通す）。
- **構造検査テスト**: 上記の `include_str!` 契約テスト。実 WebView2 を起動せずに、全 builder のフラグ・ハンドラ・capability・reconcile の位置が崩れていないことを守る。
- **TS**: `ExtensionsTab.test.tsx`（サービス呼び出しを Props で注入）、`extensionsSupport` の単体テスト、`AppSettingsPanel.test.tsx` のタブ表示、`App` 側の再読込配線。Storybook（`ExtensionsTab.stories.tsx`）。
- **実機 PoC 手順**（Windows 実機。webview2.rs と reconcile の実動作は自動テストで担保できない）:
  1. `npm run tauri:dev` で起動し、設定画面の「拡張機能」タブからフォルダ指定または Chrome 検出で追加する。
  2. 追加後に全カラムが再読込され、content script が x.com のカラム上で動くことを確認する。
  3. 無効化 / 削除 / 再有効化を行い、全アカウントのカラムに反映されることを確認する。
  4. 「ポップアップを開く」「オプションを開く」で別ウィンドウが開き、選択中アカウントのデータで動作することを確認する。
  5. アプリを再起動して拡張一覧が維持されること、Chrome 側の拡張を更新 / 削除した後の再起動で追従する（または「見つかりません」表示になる）ことを確認する。
  6. 複数アカウントで共通に適用されること、新規アカウント追加直後のカラムで拡張が使えることを確認する。
- CDP でカラム WebView の状態を観察する方法は [external-link-new-window-notes.md](external-link-new-window-notes.md) の「実機での検証方法」を流用できる。

## 既知の制約と未検証事項

- **同一 ID の二重 Add（未検証）**: WebView2 に同じ拡張を 2 回 Add したときの挙動は未確認。アプリ側は Chrome ID / フォルダの実パス（大文字小文字・区切り・末尾区切り・`\\?\` を無視して比較）で二重追加を拒否している。
- **稼働中の拡張フォルダ削除（未検証）**: Add 済みのフォルダが稼働中に消えた場合の WebView2 の挙動は未確認。静的には「次回起動で一覧から消える」ことまで確認済みで、アプリ側は `resolve_entry` が `Missing` を返し無効扱いにする。
- **Chrome 固有 API 依存の拡張**: WebView2 の拡張機能サポートは Chrome の API の一部のみ。Chrome 固有 API に依存する拡張が正しく動くかは拡張ごとに異なり、落ちないことも含めて未検証（手動テスト項目）。
- **ロケール解決**: 候補は「希望ロケール（`ja`）→ `default_locale` → `en` / `en_US` / `en_GB`」の順（`ja-JP` のように地域付きを希望した場合のみ `ja_JP` → `ja` に展開する）。希望が `ja` で `_locales` に `ja_JP` しか無い拡張は、`ja_JP` が試されず `default_locale` / `en` 側の名前になる（許容。`ja` を `ja_JP` へ広げる処理は未実装）。
- **ネットワークドライブ（`Z:` へのマップ）は検出しない**: UNC 表記のパスだけを拒否する。マップ済みドライブのフォルダは追加できてしまう。
- **壊れた `browserExtensions`**: 元の値を `browserExtensionsBroken` に退避してから空状態で続行する（`load` の配線自体は `AppHandle` が要るため自動テスト対象外。純粋部分 `split_stored_value` をテスト）。この場合、適用記録が失われるため次回の reconcile で全拡張が再 Add される（WebView2 側が同じ拡張の二重 Add をどう扱うかは上記のとおり未検証）。
- **未配線**: reconcile の失敗は `log::warn!` のみで UI には出さない（カラム作成自体は成功させる）。
- **拡張ページ用ウィンドウの孤児化（未検証）**: メインウィンドウ終了時に `extension-` ウィンドウが残らないかは実機で未確認（`prevent_close` を使わない通常ウィンドウなので `destroy()` は足していない）。
- ポップアップ / オプションは、対象アカウントのカラムが 1 つも表示されていない（レジストリに無い）と、未適用時に開けない（「このアカウントのカラムを先に表示してください」）。

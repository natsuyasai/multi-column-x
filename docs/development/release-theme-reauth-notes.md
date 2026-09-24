# リリース・テーマ切替・再認証 開発ノート

全面リファクタリング時の判断、リリース／自動更新の CI 構成、テーマ切替、更新進捗表示、再認証（Cookie 上書き）に関する実装時の設計判断・落とし穴を記録する。`README.md` の「アップデート方式のセキュリティ」節は前提とし、ここでは重複しない補足知見のみを扱う。Android 固有の Cookie 関連知見は `android-notes.md` を参照。

## 全面リファクタリング時に意図的にスコープ外とした判断

- ヘッダーカスタマイズ用スクリプト（数百 KB の React バンドル）の軽量化は、inject アーキテクチャの再設計が必要になるため見送っている。
- IPC 定数の TS/Rust コード生成一本化も、契約テスト（fixture 比較）方式で十分と判断し見送っている。
- TS/Rust のデフォルト値を突き合わせる契約テストで発見されていた `defaultScrollPosRestoreEnabled`（および `showSortButtons` / `videoAutoPlayStopEnabled` / `hideAdEnabled` / カラム設定 `showCustomMenu`）の食い違いは解消済み（`src-tauri/src/commands/settings.rs` の `GlobalSettingsData` / `ColumnSettings` を構造体レベル `#[serde(default)]` に統一し、キー欠落時は `impl Default`＝TS 側 `DEFAULT_GLOBAL_SETTINGS` / `DEFAULT_COLUMN_SETTINGS` と同じ値になる）。`defaultScrollPosRestoreEnabled` は欠落時も新規インストール時と同じ `false` に統一されている。

## リリース CI / 自動更新

- Windows/Linux の desktop ビルドジョブが同一 Release に更新用 JSON を書き込むため、両プラットフォーム分の情報が正しくマージされるかは構成変更のたびに要確認（ジョブの実行順序や生成方式次第で片方しか反映されない懸念がある）。
- Linux の自動更新対象は AppImage のみ（deb/rpm パッケージは Tauri updater 非対応）。
- Windows/macOS のコード署名は行わない方針（SmartScreen 等の警告は許容している）。

## テーマ切替

- 色をトークン化する際は用途ベースで判断すること。同じ16進数値でも背景・境界・テキストなど用途が異なれば別トークンに割り当てる必要があり、機械的な文字列置換で済ませてはいけない。
- ベースラインの `:root` にダーク値をデフォルト設定することで、テーマ解決前の初期描画フラッシュを防止している（既定がダークであることに依存した設計）。
- `matchMedia` 非対応環境は `light` 指向にフォールバックし、不正な `theme` 値は `dark` にフォールバックする、という境界値仕様になっている。
- モバイル UI の白半透明色は、トークン化すると半透明の質感が失われるが「本体テーマとの統一を優先する」という明示的なトレードオフ判断をしている。
- Android の `themes.xml` はテーマ切替の対象外。
- カラム内 WebView（X 本体ページ）は、当初はテーマ切替の対象外だったが、その後 `src/App.tsx` の `handleApplyGlobalSettings` に配線され、アプリ設定パネルでテーマを変更して適用した瞬間に解決済みテーマ（dark/light、system は OS 配色の解決値）を全カラムの X 公式ページの `night_mode` Cookie（`WEBVIEW_SCRIPTS.applyNightModeCookie`）へ反映してリロードするようになっている。値が変化した場合のみリロードする。

## 更新進捗表示

- Android（mobile）側は Kotlin から JS へのバイト単位進捗通知チャネルが無く、大改修になるため対象外と判断している。ダウンロード開始を1回通知するだけの簡易対応に留まっている。
- desktop 側は Tauri updater のイベントを進捗情報に変換し、再起動直前に専用の状態を追加通知する設計。

## 再認証（既存アカウントの Cookie 上書き）

- **旧実装の問題**: 再認証は既存アカウントの `dataDirectory` を再利用してログイン画面を開いていたため、既存 Cookie が残った状態になり、実質「新規ログイン」になっていなかった。バグというより設計不備として発見された。
- **新設計の核心**: 空の一時プロファイル／一時 `dataDirectory` で完全に新規のログインを行い、Cookie による同一性照合を行った上で、一致または初回（未登録）の場合のみ対象アカウントへ上書きコミットする。不一致・失敗・キャンセル時は元セッションを一切変更せず温存する。
- desktop はストア上の `dataDirectory` を差し替えて WebView 群を再生成するだけで新セッションに切り替わる（カラムは常にアカウントの `dataDirectory` を参照する設計のため）。旧ディレクトリの削除は、Windows の WebView2 がウィンドウ生存中プロファイルフォルダをロックするため、ウィンドウを閉じた後にベストエフォートで実行する（失敗しても致命的ではなく、孤児ディレクトリの残留を許容する設計）。
- JNI シグネチャ変更を避ける工夫として、一時プロファイル ID は Kotlin 内部で生成し、既存の呼び出しインタフェースのシグネチャ自体は変更していない。これにより ProGuard keep ルールの追加同期を回避している。
- 以前は下記3点が未確定事項として残っていたが、その後実装が進み、いずれも次のとおり方針が決着している。再認証まわりを触る際は前提として踏まえること。
  - mobile 側の一時プロファイルの後始末: `AddAccount.kt` の `finishReauthWithSentinel` が `WebViewProfiles.deleteProfile` で削除するが、使用中などの失敗は握りつぶすベストエフォート実装であり、「確実な」後始末は意図的に目指していない（desktop の孤児ディレクトリ許容と同じ設計判断）。
  - Cookie クリアの非同期完了待ち: `commitReauthCookies`（`AddAccount.kt`）は `cm.removeAllCookies { ... }` のコールバック内で新しい Cookie の `setCookie` / `flush` を行っており、クリア完了を待ってから注入する実装になっている。
  - desktop 側の新ディレクトリ削除リトライ: `delete_account_data`（`src-tauri/src/commands/account.rs`）自体は `retry_with_delay` で最大5回・200ms間隔のリトライを行うようになった。ただし `reauth_account_window` 完了後の不一致・キャンセル時に呼ぶ `deleteDataDirectory`（`src/hooks/useAccounts.ts`）はこの内部リトライ止まりで、通常のアカウント削除（`confirmRemoval`）のように失敗を `pendingDataDirectoryDeletions`（設定画面から再実行可能な保留キュー）へは積んでいない。この非対称は未解消であり、触る場合は要確認。

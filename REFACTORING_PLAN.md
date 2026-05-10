# リファクタリング計画

## 方針
- Martin Fowler のリファクタリング原則に従う
- Robert C. Martin の Clean Code 観点を適用
- t-wada 推奨 TDD フロー（テストGreen確認 → 小さな変更 → テスト確認 → コミット）
- 1対応ごとにコミット

## 特定したコードスメル

### S1: マジックストリング（Magic Number/String）
- **場所**: `App.tsx:247`
- **内容**: `invoke("open_compose_window", ...)` が `IPC_COMMANDS` 定数を使わず生文字列を使用
- **手法**: Replace Magic Literal

### S2: 重複コード（Duplicated Code）
- **場所**: `ColumnHeader.tsx:104-117` の `getPageLabel` と `useColumns.ts:9-18` の `getMobileTabLabel`
- **内容**: ページタイプ→ラベル変換ロジックが2箇所に存在（わずかに異なる）
- **手法**: Extract Function → 共通ユーティリティに移動

### S3: インラインIIFE（Inline IIFE in JSX）
- **場所**: `App.tsx:502-513`（SettingsPanel）、`App.tsx:515-532`（TabActionDialog）
- **内容**: `{(() => { const col = ...; return col ? ... : null; })()}` パターン
- **手法**: Extract Variable（JSX内でのIIFEを変数抽出で置換）

### S4: 重複パース処理（Duplicated Code）
- **場所**: `useAccounts.ts:63-78`（mobile）、`useAccounts.ts:86-97`（desktop）
- **内容**: `JSON.parse(result)` とその型アノテーションが全く同一
- **手法**: Extract Function

### S5: サイドバー幅の重複計算（Duplicated Code）
- **場所**: `useColumns.ts:220-223`（recalculateAllBounds）、`useColumns.ts:338-341`（handleAddColumn）
- **内容**: `sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH` が2回
- **手法**: Extract Function

### S6: 長い関数（Long Function）
- **場所**: `useColumns.ts:245-307` の `restoreColumns`
- **内容**: モバイルとデスクトップの処理がベタ書きで長い
- **手法**: Extract Function（mobile/desktopパスを別関数に分離）

### S7: App.tsx内のインラインダイアログ（Feature Envy / Long Component）
- **場所**: `App.tsx:360-412`（LinkPopupDialog）、`App.tsx:414-448`（ComposeTweetDialog）
- **内容**: ダイアログUIがApp.tsx内にインラインで書かれており、独立したコンポーネントとして分離すべき
- **手法**: Extract Component

### S8: AddColumnDialog内のIIFE（Inline IIFE）
- **場所**: `AddColumnDialog.tsx:42-45`
- **内容**: `gridCol` 計算のIIFEをインライン変数に抽出できる
- **手法**: Extract Variable

### S9: App.tsx のダイアログ状態の Data Clumps
- **場所**: `App.tsx:73-84`
- **内容**: リンクポップアップ・ツイート作成の関連state群が散在
- **手法**: 各ダイアログの状態を関連するhandlerとまとめてhookに抽出（Extract Hook）

## 対応順序

| # | スメル | 手法 | 優先度 | 状態 |
|---|--------|------|--------|------|
| 1 | S1: マジックストリング | Replace Magic Literal | High | [x] |
| 2 | S2: 重複コード（ページラベル） | Extract Function + Move | High | [x] |
| 3 | S3: インラインIIFE（App.tsx） | Extract Variable | Medium | [x] |
| 4 | S4: 重複パース処理 | Extract Function | Medium | [x] |
| 5 | S5: サイドバー幅の重複計算 | Extract Function | Medium | [x] |
| 6 | S6: 長いrestoreColumns | Extract Function | Medium | [x] |
| 7 | S8: AddColumnDialog IIFE | Extract Variable | Low | [x] |
| 8 | S7: インラインダイアログ | Extract Component | Low | [x] |
| 9 | S9: ダイアログ状態のData Clumps | Extract Hook | Low | [x] |

## テストセット修正（前提）
- `useColumns.test.ts`: `@tauri-apps/api/event` モック追加（完了）

---

## Rust / Kotlin 追加対応

### RS1: グローバル設定の重複読み込み（Duplicated Code）
- **場所**: `commands/webview.rs` の `load_video_auto_play_stop_enabled` / `load_small_image_settings` / `load_hide_ad_enabled` / `load_zoom_level` / `load_popup_esc_close_enabled`
- **内容**: 5つの関数がそれぞれ `store("settings.json") → appSettings → globalSettings` を辿る同一パターンを持つ
- **手法**: Extract Function → `load_global_settings_value` ヘルパーで共通化

### RS2: ポップアップウィンドウ位置計算の重複（Duplicated Code）
- **場所**: `commands/webview.rs:348-365`（open_popup_window）と `L472-489`（open_link_popup_window）
- **内容**: メインウィンドウ座標取得 → パディング付きの位置・サイズ計算が同一ロジック
- **手法**: Extract Function → `get_popup_position_and_size`

### RS3: デフォルト設定の重複定義（Duplicated Code）
- **場所**: `commands/settings.rs::load_settings` と `lib.rs::save_window_bounds`
- **内容**: `GlobalSettingsData` と `AppSettingsData` のデフォルト値が2箇所に重複
- **手法**: Introduce Default Trait

### RS4: build_init_script の長いパラメータリスト（Long Parameter List）
- **場所**: `inject/mod.rs:5-17`
- **内容**: 11個の引数。Parameter Object を導入して可読性を高める
- **手法**: Introduce Parameter Object

### RS5: onSwipeNavigate / onSwipeProgress の重複（Duplicated Code）
- **場所**: `android_bridge.rs:61-95`
- **内容**: 2つのJNIエントリポイントがJNI文字列変換→emit のほぼ同一ロジックを持つ
- **手法**: Extract Function

### KT1: runOnUiThread + CountDownLatch の重複パターン（Duplicated Code）
- **場所**: `MainActivity.kt:createPopupWebView / removePopupWebView / createColumnWebView / removeColumnWebView`
- **内容**: JNIスレッド→UIスレッドへの同期パターンが4箇所に重複
- **手法**: Extract Function → `runOnUiThreadSync`

### KT2: contentRoot 取得の重複（Duplicated Code）
- **場所**: `MainActivity.kt` 全体で5箇所以上
- **内容**: `window.decorView.findViewById<FrameLayout>(android.R.id.content)` が毎回書かれている
- **手法**: Extract Property

### KT3: WebView Profile 設定の重複（Duplicated Code）
- **場所**: `MainActivity.kt:createPopupWebView` と `createColumnWebView`
- **内容**: Profile API サポート確認 → Profile 設定ブロックが重複
- **手法**: Extract Function → `setupWebViewProfile`

## Rust/Kotlin 対応順序

| # | スメル | 手法 | 優先度 | 状態 |
|---|--------|------|--------|------|
| R1 | RS3: デフォルト設定の重複 | Introduce Default Trait | High | [x] |
| R2 | RS1: グローバル設定の重複読み込み | Extract Function | High | [x] |
| R3 | RS2: ポップアップ位置計算の重複 | Extract Function | Medium | [x] |
| R4 | RS4: build_init_script 長いパラメータ | Introduce Parameter Object | Medium | [x] |
| R5 | RS5: onSwipe JNI 重複 | Extract Function | Low | [x] |
| R6 | KT2: contentRoot の重複取得 | Extract Property | High | [x] |
| R7 | KT1: runOnUiThread+Latch パターン | Extract Function | High | [x] |
| R8 | KT3: WebView Profile 設定の重複 | Extract Function | Medium | [x] |

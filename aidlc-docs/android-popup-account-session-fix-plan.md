# Android リンクポップアップのアカウントセッション問題 修正計画

作成日: 2026-06-11

## 報告された問題

URL をポップアップで開く操作画面（Android）で:

1. まれに未ログイン状態になる
2. 選択したアカウントでログインした状態でリンクが開かれない

## 根本原因分析

### RC-1: WebView Profile 分離が全端末で無効（主因・検証済み）

`WebViewProfiles.isSupported` が `WebViewFeature.isFeatureSupported("PROFILE_URLS_AND_COOKIE_MANAGER")`
を呼んでいるが、androidx.webkit 1.14.0 にこの feature は**存在しない**（正しくは `MULTI_PROFILE`）。

検証方法: gradle キャッシュの `webkit-1.14.0.aar` から `WebViewFeature.class` の定数プールを抽出。
存在する関連定数は `MULTI_PROFILE` / `GET_COOKIE_INFO` / `PROFILE_URL_PREFETCH` のみ。
未知の feature 文字列は `WebViewFeatureInternal` が "Unknown feature" の RuntimeException を投げ、
`isSupported` の try/catch に握り潰されて**常に false** を返す。

結果:

- カラム / ポップアップ / AddAccount の全 WebView がデフォルトプロファイル
  （共有 CookieManager + 共有 localStorage/IndexedDB）で動作
- アカウント切替は `setCookieForAccount`（グローバル Cookie のファイルからの差し替え）に依存

### RC-2: Cookie 差し替えの非同期競合 + ポップアップにリカバリなし（問題1の直接原因）

- `setCookieForAccount` は `removeAllCookies(null)`（非同期）→ `setCookie`（非同期）を
  完了待ちせずに呼び、呼び出し元は直後に `loadUrl` する。タイミング次第で
  Cookie 未設定のままロードが始まり、まれに未ログイン状態になる。
- カラム用 `ColumnWebViewClient` には「ログイン画面検知 → 1.5 秒後に元 URL へリカバリ」が
  あるが、ポップアップ用 `ExternalLinkWebViewClient` には**ない**。

### RC-3: グローバルセッション共有（問題2の直接原因）

- ポップアップを選択アカウント B で開いてもグローバル Cookie 差し替えに過ぎず、
  アクティブカラム（アカウント A）切替時の `setAccountCookies(A)` で上書きされる
- localStorage / IndexedDB / Service Worker は全アカウント共有のため、
  x.com が直前アカウントのセッション状態を参照する
- `x_cookies.txt` は AddAccount ログイン時のスナップショットで、Cookie ローテーション後は陳腐化

### 補足: React / Rust 側は正常

- `LinkPopupDialog` は選択アカウント ID を正しく `onSubmit` に渡す
- `App.tsx handleSubmitLinkPopup` → `open_link_popup_window`（mobile 実装）→
  `android_bridge::create_popup_webview` まで accountId は正しく伝搬する

## 修正計画

### Phase 1: Profile API 判定と適用順序の修正（WebViewProfiles.kt / MainActivity.kt / AddAccount.kt）

1. `WebViewProfiles` の feature 判定を文字列リテラルではなく `WebViewFeature.MULTI_PROFILE` 定数に変更
2. `MainActivity.newConfiguredWebView`: `WebViewCompat.setProfile` を **WebView 生成直後の最初の操作**に移動
   （現状は settings 設定・`setAcceptThirdPartyCookies` の後に呼んでおり、
   Profile API の「WebView 使用前に setProfile」制約に抵触し得る）
3. プロファイル適用時のサードパーティ Cookie 許可は、デフォルトの
   `CookieManager.getInstance()` ではなく **プロファイルの CookieManager**
   （`Profile.getCookieManager()`）に対して行う（api.x.com 401 対策の実効性確保）
4. `WebViewProfiles.apply` の戻り値（失敗）を無視せず、失敗時は Cookie フォールバックに切り替える
5. `AddAccount.kt` も同じ順序（生成 → setProfile → settings → cookie）に修正

### Phase 2: 既存セッションのプロファイル移行

Profile 有効化直後は各 "account-X" プロファイルが空のため、そのままでは全カラムが未ログイン化する。

- プロファイル**初回作成時**に `accounts/account-{id}/x_cookies.txt` が存在すれば、
  プロファイルの CookieManager へ流し込む（auth_token は長寿命のため概ね移行可能）
- 移行可否の判定: ProfileStore に既存プロファイルがあるか（`getAllProfileNames`）等で冪等にする
- 移行に失敗した場合はログイン画面が表示される（AddAccount で再ログインすれば回復）

### Phase 3: ポップアップへのログインリカバリ適用

- `ColumnWebViewClient` のログイン画面検知リカバリ（onPageFinished で
  `x.com/login` 検知 → 1 回だけ元 URL を再ロード）を共通化し、
  ポップアップ WebView にも適用する

### Phase 4: Cookie フォールバック経路の競合修正（Profile 非対応端末向け安全網）

- `setCookieForAccount` を「`removeAllCookies` のコールバック完了 → `setCookie` → `loadUrl`」の
  順序保証付きに変更（loadUrl をコールバック後に遅延させる構造へ）

## 制約・注意事項

- `MainActivity` の JNI から呼ばれるメソッド（`createPopupWebView` / `createColumnWebView` 等）の
  **シグネチャは変更しない**（proguard-rules.pro 同期が不要になる）
- テストは `cd src-tauri/gen/android && ./gradlew.bat :app:testUniversalDebugUnitTest`
  （`testDebugUnitTest` では app のテストは実行されない）
- フォーマッタ: `./gradlew.bat ktlintFormat`
- テストケース名は日本語、コミットメッセージも既存スタイルに合わせる
- 1 作業 1 コミット
- 実機での最終動作確認はユーザーが実施（リリースビルドで R8 動作も確認すること）

## 検証計画

- 単体テスト: 純粋ロジック（Cookie 文字列パース、リカバリ判定 URL、feature 定数）を抽出してテスト
- コンパイル + 既存テスト: `:app:testUniversalDebugUnitTest` がオールグリーン
- 実機（ユーザー実施）:
  1. アカウント B を選択してリンクポップアップ → B のセッションで開くこと
  2. 繰り返し開閉して未ログイン状態にならないこと
  3. 既存カラムが移行後もログイン状態を維持していること

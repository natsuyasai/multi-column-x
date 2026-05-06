# Android 対応設計

## 概要

MultiColumnX をデスクトップに加えて Android でも動作させる。デスクトップの動作は一切変更せず、`#[cfg(mobile)]` / `#[cfg(desktop)]` による条件コンパイルと isMobile フラグによる UI 分岐で Android 固有の差分を局所化する。

## 要件

- Android でアプリが起動・動作すること
- 列はタブバーで1列ずつ切り替え表示（画面幅によるレスポンシブ対応は不要）
- 全列の WebView は常時バックグラウンドで生存し、タブ切り替え時もページ状態・スクロール位置が維持される
- ポップアップ（メディア・リンク・ツイート作成）はフルスクリーン child WebView で表示し、戻ると列の状態は維持される
- アカウント追加は別 Activity として x.com/login を表示し、ログイン完了後に自動クローズ
- デスクトップの動作は変更しない

## アーキテクチャ方針

Tauri 2 の `#[cfg(mobile)]` / `#[cfg(desktop)]` で Rust コードを分岐し、フロントエンドは `isMobile` フラグ（`tauri-plugin-os` で取得）で UI を分岐する。

```text
プラットフォーム別の動作:

Desktop:
  - 複数列を横並びで同時表示（現状維持）
  - ポップアップ・アカウント追加は新規ウィンドウ（WebviewWindow）
  - ウィンドウ bounds を保存・復元

Android:
  - MobileTabBar で1列ずつ切り替え表示
  - 非アクティブ列は (-99999, 0) にオフスクリーン退避
  - ポップアップは child WebView（window.add_child）
  - アカウント追加は別 Activity（WebviewWindow + AndroidManifest 登録）
  - ウィンドウ bounds 保存はスキップ
  - サイドバー非表示
```

## 変更ファイル一覧

| ファイル | 変更内容 |
| --- | --- |
| `src-tauri/tauri.conf.json` | Android minSdkVersion 設定追加 |
| `src-tauri/Cargo.toml` | `tauri-plugin-os = "2"` 追加 |
| `src-tauri/src/lib.rs` | ウィンドウイベント・初期化を `#[cfg(desktop)]` で囲む、OS プラグイン登録、`LoginCompleteFlag` 管理 |
| `src-tauri/src/commands/account.rs` | `open_add_account_window` を desktop/mobile 実装に分岐、`mark_login_complete`・`check_login_complete` 追加 |
| `src-tauri/src/commands/webview.rs` | ポップアップ系コマンドを desktop/mobile 実装に分岐、`close_popup_window` を共通化 |
| `src-tauri/gen/android/app/src/main/AndroidManifest.xml` | AddAccount Activity 登録 |
| `src-tauri/gen/android/app/src/main/java/.../AddAccount.kt` | AddAccount Activity（sentinel ファイル監視で自己クローズ） |
| `src/hooks/useColumns.ts` | `activeColumnId` 管理・WebView 表示/非表示切り替え追加 |
| `src/hooks/useAccounts.ts` | mobile 向け `visibilitychange` + `check_login_complete` パス追加 |
| `src/store/useAppStore.ts` | `isMobile: boolean` フラグ追加 |
| `src/App.tsx` | プラットフォーム判定・MobileTabBar 表示・ハンドラ分岐 |
| `src/components/MobileTabBar/` | 新規コンポーネント（Android 専用タブバー） |
| `package.json` | `@tauri-apps/plugin-os` 追加 |

---

## Android マルチウィンドウの制約と設計判断

### `add_child()` は mobile では使用不可

当初の設計では popup と同様に `window.add_child()` でアカウント追加画面を実装する予定だったが、**Tauri 2 の Android 実装では `add_child()` はモバイルで利用できない**。

### アカウント追加は別 Activity として実装する

Tauri 2 の Android マルチウィンドウ（https://tauri.app/ja/learn/mobile-multiwindow/）に従い、アカウント追加専用の Activity `AddAccount` を定義する。

- `WebviewWindowBuilder` でウィンドウを生成 → Android では新しい Activity が起動する
- ラベル `"add-account"` → クラス名 `AddAccount`（ケバブケースをパスカルケースに変換）
- `AndroidManifest.xml` に `<activity android:name=".AddAccount" />` を登録する

### IPC ルーティングの問題と対策

`WebviewWindowBuilder::build()` を呼び出した直後、Tauri の Android IPC ルーティング先が AddAccount Activity の WebView に切り替わる。そのままコマンドハンドラが `Ok(...)` を返すとコールバックが AddAccount に届き、メイン WebView の `invoke()` Promise が永久に resolve されない。

**対策**: `build()` を `tokio::spawn` の中で実行し、`Ok(...)` を先に返すことでコールバックをメイン WebView に届ける。

```rust
tokio::spawn(async move {
    // build() をここで実行（Ok() 返却後）
});
Ok(result_json) // build() より先に返す
```

### SPA 遷移（pushState）は Rust の URL ポーリングでは検知できない

x.com はシングルページアプリ（React ベース）であり、ログイン後の `/home` 遷移は `history.pushState` で行われる。Android WebView の `onPageStarted` は pushState では呼ばれないため、Tauri の `WebviewWindow::url()` / `Webview::url()` は遷移後も `/login` を返し続ける。

Rust 側のポーリングではログイン完了を検知できない。

### ログイン完了検知は init script（JavaScript 側）で行う

`WebviewWindowBuilder::initialization_script()` で AddAccount の WebView に JavaScript を注入する。`location.pathname` は SPA の pushState でも即座に更新されるため、正確にログイン完了を検知できる。

```javascript
(function() {
    var invoked = false;
    function checkLoginComplete() {
        if (!invoked && location.pathname === '/home') {
            if (window.__TAURI_INTERNALS__) {
                invoked = true;
                window.__TAURI_INTERNALS__.invoke('mark_login_complete')
                    .catch(function() { invoked = false; });
            }
        }
        setTimeout(checkLoginComplete, 500);
    }
    setTimeout(checkLoginComplete, 500);
})();
```

> `window.__TAURI_INTERNALS__` は TauriActivity の WebView に自動注入される Tauri の init script で設定される。外部 URL（x.com）でも注入される。

### `window.close()` from Rust は Android Activity を閉じられない

`app.get_webview_window("add-account").close()` を Rust から呼び出しても AddAccount Activity は閉じない。Tauri 2 Android の multi-window における close の dispatch が正しく機能しない。

**対策**: sentinel ファイルを介して Kotlin 側で `finish()` を呼ぶ。

1. Rust の `mark_login_complete` コマンドが `app_data_dir()/add_account_login_complete` にファイルを書く
2. AddAccount.kt の `Handler` が 500ms ごとにファイルを監視し、検出したら `finish()` を呼ぶ

`app_data_dir()` (Rust) と `filesDir` (Kotlin) は同じパス（`/data/data/{package}/files/`）に対応する。

### AddAccount の Activity クローズ後のイベント受信問題

AddAccount が前面にある間、MainActivity の WebView は Android によって suspend される。この状態で Rust が `emit("account-login-complete")` を送っても、メイン WebView の JavaScript は実行されないためイベントを受け取れない。

**対策**: `document.visibilitychange` + `check_login_complete` による主系と、delayed emit による副系の2経路を設ける。

---

## Rust バックエンド詳細

### lib.rs

以下を `#[cfg(desktop)]` で囲む:

- `save_window_bounds` 関数全体
- `setup()` 内のウィンドウ位置・サイズ復元処理
- `.on_window_event()` のウィンドウ bounds 保存

OS プラグインと LoginCompleteFlag を登録:

```rust
.plugin(tauri_plugin_os::init())
.manage(commands::account::LoginCompleteFlag::new())
```

invoke_handler に追加:

```rust
commands::account::mark_login_complete,
commands::account::check_login_complete,
```

### commands/account.rs

#### LoginCompleteFlag（管理状態）

Activity 切り替えをまたいでログイン完了状態を保持する。

```rust
pub struct LoginCompleteFlag(pub std::sync::Mutex<bool>);
```

#### open_add_account_window（mobile）

```
1. accountId・dataDirectory を生成し、即座に Ok(JSON) を返す
2. tokio::spawn の中で:
   a. 既存ウィンドウがあれば close して 300ms 待機
   b. WebviewWindowBuilder で AddAccount を build（initialization_script 付き）
3. init script が /home を検知したら invoke("mark_login_complete") を呼ぶ
```

ラベルは固定値 `"add-account"`（Activity クラス `AddAccount` と対応）。

#### mark_login_complete（全プラットフォーム）

AddAccount の init script から呼ばれる。

```
1. LoginCompleteFlag を true にセット
2. [mobile のみ] app_data_dir/add_account_login_complete にファイルを書く
3. [mobile のみ] window.close() を試みる（効かない場合でも害はない）
4. 1000ms 後に emit("account-login-complete")（AddAccount が閉じた後に届く副系）
```

#### check_login_complete（全プラットフォーム）

メイン WebView の visibilitychange ハンドラから呼ばれる。フラグを取得してクリアする（一度だけ true を返す）。

#### open_add_account_window（desktop）

既存実装を維持（WebviewWindow の新規作成 + Rust 側 URL ポーリング）。x.com のデスクトップ版は SPA の pushState でも `onPageStarted` が呼ばれる（Chromium の動作）ため、Rust ポーリングが有効。

### commands/webview.rs

`open_popup_window` / `open_link_popup_window` / `open_compose_window` をプラットフォームで分岐する:

- `#[cfg(desktop)]`: 既存実装（新規 WebviewWindow を作成）
- `#[cfg(mobile)]`: `window.add_child()` でフルスクリーン child WebView を作成

`close_popup_window` を共通化: `get_webview_window` を試みてから `get_webview` にフォールバック。

```rust
pub async fn close_popup_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    } else if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

### AddAccount.kt

sentinel ファイルを監視して自己クローズする。`filesDir` は Rust の `app_data_dir()` と同じパス。

```kotlin
class AddAccount : TauriActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var polling = false

    override fun onResume() {
        super.onResume()
        polling = true
        schedulePoll()
    }

    override fun onPause() {
        super.onPause()
        polling = false
        handler.removeCallbacksAndMessages(null)
    }

    private fun schedulePoll() {
        handler.postDelayed({
            if (!polling) return@postDelayed
            val sentinel = File(filesDir, "add_account_login_complete")
            if (sentinel.exists()) {
                sentinel.delete()
                finish()
            } else {
                schedulePoll()
            }
        }, 500)
    }
}
```

### AndroidManifest.xml

```xml
<activity
    android:name=".AddAccount"
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
    android:exported="false" />
```

---

## フロントエンド詳細

### プラットフォーム検出

`App.tsx` の初期化時に `platform()` を呼び出し、`useAppStore` の `isMobile` にセットする:

```typescript
import { platform } from '@tauri-apps/plugin-os';
platform().then((p) => setIsMobile(p === 'android')).catch(() => {});
```

### useAccounts.ts のアカウント追加フロー

**Desktop（主系: account-login-complete イベント）**

```
invoke("open_add_account_window")
→ listen("account-login-complete")（Rust ポーリングが emit）
→ アカウント追加
→ tauri://destroyed でキャンセル検知
```

**Android（主系: visibilitychange + check_login_complete）**

```
invoke("open_add_account_window") → 即座に resolve（build() より前）
→ document.addEventListener("visibilitychange", ...)
  → visibilityState が "visible" になったら invoke("check_login_complete")
  → true なら アカウント追加
  → false なら キャンセル扱い
+ listen("account-login-complete")（AddAccount close 後の delayed emit が届いた場合の副系）
```

`visibilitychange` が先に発火した場合も `account-login-complete` が先に発火した場合も、`cleanup()` が両方のリスナーを削除するため二重実行は起きない。

### useColumns.ts

追加するステート・関数:

- `activeColumnId: string | null` — モバイルで現在表示中の列 ID
- `setActiveColumn(id: string)` — 選択列を `(0, MOBILE_TAB_BAR_HEIGHT)` に移動、非選択列を `(-99999, 0)` に移動
- `MOBILE_TAB_BAR_HEIGHT = 56`

モバイル時のカラムサイズ:

- width: 画面全体幅
- height: 画面全体高さ − 56px（タブバー分）

### MobileTabBar コンポーネント（新規）

`src/components/MobileTabBar/MobileTabBar.tsx`

- 画面下部に固定表示（`position: fixed; bottom: 0`）
- 高さ: 56px
- 横スクロール可能なタブリスト
- 各タブ: アカウントカラー（左ボーダー）+ 列ラベルまたは pageType 名 + 設定ボタン（⚙）
- タップで `setActiveColumn(id)` を呼び出す
- アクティブタブは背景色で強調表示

### App.tsx

モバイル時の変更:

- `<Sidebar>` を非表示
- `<MobileTabBar>` を表示（画面下部）
- `ColumnHeader` を非表示（タブバーが代替）
- `handleComposeTweet` / `handleOpenLinkPopup` は invoke 先を変えず、Rust 側の `#[cfg(mobile)]` 実装に委譲

---

## ビルド設定

### Cargo.toml

```toml
[dependencies]
tauri-plugin-os = "2"
```

### tauri.conf.json

```json
{
  "bundle": {
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

### Android 環境セットアップ（初回のみ）

```bash
npm run tauri android init   # src-tauri/gen/android/ を生成
npm run tauri android dev    # 開発（エミュレーター or 実機）
npm run tauri android build  # リリースビルド
```

`src-tauri/gen/android/` はバージョン管理対象に含める（`.gitignore` で `src-tauri/gen/schemas/` のみ除外）。

---

## リスク事項

- Android での `WebviewBuilder::data_directory()` によるセッション分離はデスクトップほど確実ではない可能性がある。実装後に実機で複数アカウントのセッション分離が正しく動作するか検証が必要。
- Tauri 2 Android の multi-window `window.close()` は動作しないため、sentinel ファイル経由の Kotlin `finish()` に依存している。Tauri のバージョンアップで修正された場合は sentinel ファイル方式を廃止できる。

## 対応しないこと

- iOS 対応（今回は Android のみ）
- レスポンシブな多列表示（Android では常に1列表示）
- Android でのウィンドウ bounds 保存・復元

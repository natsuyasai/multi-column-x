# Android 対応設計

## 概要

MultiColumnX をデスクトップに加えて Android でも動作させる。デスクトップの動作は一切変更せず、`#[cfg(mobile)]` / `#[cfg(desktop)]` による条件コンパイルと isMobile フラグによる UI 分岐で Android 固有の差分を局所化する。

## 要件

- Android でアプリが起動・動作すること
- 列はタブバーで1列ずつ切り替え表示（画面幅によるレスポンシブ対応は不要）
- 全列の WebView は常時バックグラウンドで生存し、タブ切り替え時もページ状態・スクロール位置が維持される
- ポップアップ（メディア・リンク・ツイート作成）はフルスクリーン child WebView で表示し、戻ると列の状態は維持される
- アカウント追加はフルスクリーン child WebView で x.com/login を表示し、ログイン完了後に自動クローズ
- デスクトップの動作は変更しない

## アーキテクチャ方針

Tauri 2 の `#[cfg(mobile)]` / `#[cfg(desktop)]` で Rust コードを分岐し、フロントエンドは `isMobile` フラグ（`tauri-plugin-os` で取得）で UI を分岐する。

```text
プラットフォーム別の動作:

Desktop:
  - 複数列を横並びで同時表示（現状維持）
  - ポップアップ・アカウント追加は新規ウィンドウ
  - ウィンドウ bounds を保存・復元

Android:
  - MobileTabBar で1列ずつ切り替え表示
  - 非アクティブ列は (-99999, 0) にオフスクリーン退避
  - ポップアップ・アカウント追加はフルスクリーン child WebView
  - ウィンドウ bounds 保存はスキップ
  - サイドバー非表示
```

## 変更ファイル一覧

| ファイル | 変更内容 |
| --- | --- |
| `src-tauri/tauri.conf.json` | Android minSdkVersion 設定追加 |
| `src-tauri/Cargo.toml` | `tauri-plugin-os = "2"` 追加 |
| `src-tauri/src/lib.rs` | ウィンドウイベント・初期化を `#[cfg(desktop)]` で囲む、OS プラグイン登録 |
| `src-tauri/src/commands/account.rs` | `open_add_account_window` を desktop/mobile 実装に分岐 |
| `src-tauri/src/commands/webview.rs` | ポップアップ系コマンドを desktop/mobile 実装に分岐、`close_popup_window` を共通化 |
| `src/hooks/useColumns.ts` | `activeColumnId` 管理・WebView 表示/非表示切り替え追加 |
| `src/store/useAppStore.ts` | `isMobile: boolean` フラグ追加 |
| `src/App.tsx` | プラットフォーム判定・MobileTabBar 表示・ハンドラ分岐 |
| `src/components/MobileTabBar/` | 新規コンポーネント（Android 専用タブバー） |
| `package.json` | `@tauri-apps/plugin-os` 追加 |

## Rust バックエンド詳細

### lib.rs

以下を `#[cfg(desktop)]` で囲む:

- `save_window_bounds` 関数全体
- `setup()` 内のウィンドウ位置・サイズ復元処理
- `.on_window_event()` のウィンドウ bounds 保存

OS プラグインを登録:

```rust
.plugin(tauri_plugin_os::init())
```

### commands/account.rs

`open_add_account_window` をプラットフォームで分岐する:

- `#[cfg(desktop)]`: 既存実装（新規 WebviewWindow を作成）
- `#[cfg(mobile)]`: `window.add_child()` でフルスクリーン child WebView を作成。データディレクトリ・URL ポーリング・イベント発行のロジックはデスクトップ版と共通。WebView ラベルは `add-account-{account_id[..8]}`。

### commands/webview.rs

`open_popup_window` / `open_link_popup_window` / `open_compose_window` をプラットフォームで分岐する:

- `#[cfg(desktop)]`: 既存実装（新規 WebviewWindow を作成）
- `#[cfg(mobile)]`: `window.add_child()` でフルスクリーン child WebView を作成。ラベル形式・init_script・データディレクトリの扱いはデスクトップ版と同じ。

`close_popup_window` を共通化: `get_webview_window` を試みてから `get_webview` にフォールバックすることで、デスクトップ版 WebviewWindow とモバイル版 child WebView の両方をクローズできる。

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

**フルスクリーンサイズ取得（モバイル版共通処理）:**

```rust
let window = app.get_window("main").ok_or("main window not found")?;
let size = window.inner_size().map_err(|e| e.to_string())?;
let scale = window.scale_factor().unwrap_or(1.0);
let logical_w = size.width as f64 / scale;
let logical_h = size.height as f64 / scale;
```

### リスク事項

Android での `WebviewBuilder::data_directory()` によるセッション分離はデスクトップほど確実ではない可能性がある。実装後に実機で複数アカウントのセッション分離が正しく動作するか検証が必要。動作しない場合はアカウント切り替え機能を Android では制限することを検討する。

## フロントエンド詳細

### プラットフォーム検出

`App.tsx` の初期化時に `platform()` を呼び出し、`useAppStore` の `isMobile` にセットする:

```typescript
import { platform } from '@tauri-apps/plugin-os';
const isMobile = (await platform()) === 'android';
```

### useColumns.ts

追加するステート・関数:

- `activeColumnId: string | null` — モバイルで現在表示中の列 ID
- `setActiveColumn(id: string)` — 選択列を `(0, tabBarHeight)` に移動（モバイルはサイドバー非表示のため x=0）、非選択列を `(-99999, 0)` に移動。`resize_column_webview` コマンドを呼び出す
- `createColumnWebview` の初期位置: モバイルでは最初の列のみ表示位置、それ以外は `(-99999, 0)`

モバイル時のカラムサイズ:

- width: 画面全体幅
- height: 画面全体高さ − タブバー高さ (56px)

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
- `handleComposeTweet` / `handleOpenLinkPopup` は `invoke` の呼び出し先は変えず、Rust 側の `#[cfg(mobile)]` 実装に委譲

列の設定パネルはタブバーの各タブの設定ボタン（⚙）から開く。

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
# Android プロジェクト生成
npm run tauri android init

# 開発（エミュレーター or 実機）
npm run tauri android dev

# リリースビルド
npm run tauri android build
```

`tauri android init` により `src-tauri/gen/android/` が生成され、`AndroidManifest.xml` にインターネット権限が自動追加される。

## 対応しないこと

- iOS 対応（今回は Android のみ）
- レスポンシブな多列表示（Android では常に1列表示）
- Android でのウィンドウ bounds 保存・復元

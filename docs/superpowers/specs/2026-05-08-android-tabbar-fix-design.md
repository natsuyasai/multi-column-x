# Android タブバー修正設計

## 概要

注入タブバー（`mobile_tab_bar.js`）を廃止し、React MobileTabBar コンポーネントを常時表示する方式に切り替える。column WebView の高さを `innerHeight - 56px` に縮めることで、画面下部 56px に React タブバーを露出させ、Tauri IPC に依存しない安定した操作を実現する。

## 問題

現状、x.com を表示する column WebView が `height: window.innerHeight`（全画面）で配置されており、main React WebView を完全に覆っている。タブバーは `mobile_tab_bar.js` として x.com の DOM に注入されているが、外部 WebView では `window.__TAURI_INTERNALS__` が利用できず Tauri IPC が無効となるため、ボタン操作が無反応になる。

```
現状のスタック（上から）
┌─────────────────────────────┐
│ 注入タブバー (mobile_tab_bar.js) │ ← 見える、でも動かない（IPC 無効）
│ x.com コンテンツ              │
│ [column WebView: h=innerHeight] │
├─────────────────────────────┤
│ React MobileTabBar            │ ← 完全に隠れて操作不能
│ [main WebView]                │
└─────────────────────────────┘
```

## Android 制約との整合性

- column WebView は動的ラベル（`column-{uuid}`）を使う `WebviewWindowBuilder` で生成されるため、別 Activity にはならず MainActivity 内の子 View として配置される
- `window.innerHeight` は `decorView.setPadding()` により safe area（status bar / navigation bar を除いた領域）の高さを返す
- column WebView の `height: innerHeight - 56px` と React MobileTabBar の `bottom: 0; height: 56px` は幾何学的に整合する

```
修正後のスタック
┌─────────────────────────────┐
│ x.com コンテンツ              │
│ [column WebView: h=innerHeight-56] │ ← 下部 56px を開ける
├─────────────────────────────┤
│ React MobileTabBar (56px)    │ ← 表示・操作可能
│ [main WebView]               │
└─────────────────────────────┘
```

## 変更内容

### `src/App.tsx`

1. MobileTabBar を `columns.length === 0` 条件なしで `isMobile` 時に常時表示する
2. `mobile-switch-column` イベントリスナーを削除（React タブバーが直接 `setActiveColumn` を呼ぶため不要）
3. `mobile-open-dialog` イベントリスナーを削除（React タブバーが直接ダイアログ state を操作するため不要）

```tsx
// Before
{isMobile && columns.length === 0 && <MobileTabBar ... />}

// After
{isMobile && (
  <MobileTabBar
    columns={columns}
    accounts={accounts}
    activeColumnId={activeColumnId}
    onSelectColumn={setActiveColumn}
    onOpenSettings={setSettingsColumnId}
    onAddColumn={() => setShowAddColumn(true)}
    onAccountManager={() => setShowAccountManager(true)}
  />
)}
```

### `src/hooks/useColumns.ts`

1. mobile 時の column WebView 高さを `window.innerHeight - MOBILE_TAB_BAR_HEIGHT` に変更（対象: `setActiveColumn`・`restoreColumns`・`handleAddColumn`・`hideColumnWebviews`）
2. `buildMobileTabsJson` 関数を削除
3. `invoke("create_column_webview")` の `mobileTabs` / `mobileActiveId` 引数を削除
4. `eval_in_webview` でタブバーを更新していた呼び出しをすべて削除（`setActiveColumn`・`handleAddColumn`・`handleRemoveColumn` 内）
5. `getMobileInsets()` の呼び出しを削除（タイミング用途だったが、注入タブバー廃止により不要）

### `src-tauri/src/commands/webview.rs`

1. `CreateWebviewArgs` から `mobile_tabs`・`mobile_active_id` フィールドを削除
2. mobile `create_column_webview` から `build_mobile_column_init_script` 分岐を削除し、通常の `build_init_script` を使用
3. `switch_mobile_column` コマンドを削除
4. `open_mobile_dialog` コマンドを削除

### `src-tauri/src/inject/mod.rs`

`build_mobile_column_init_script` 関数を削除。

### `src-tauri/src/lib.rs`

invoke_handler から `switch_mobile_column`・`open_mobile_dialog` の登録を削除。

### 削除ファイル

| ファイル                                      | 理由                 |
| --------------------------------------------- | -------------------- |
| `src-tauri/src/inject/_src/mobile_tab_bar.ts` | column への注入廃止  |
| `src-tauri/src/inject/mobile_tab_bar.js`      | 同上（ビルド成果物） |

### 変更しないもの

- `get_mobile_insets` コマンド（Rust）および `getMobileInsets` TypeScript 関数: 将来的に使う可能性があるため残す
- `hide()` / `show()` / `set_position(-99999)` による非アクティブ列の退避ロジック: 既存の hitbox 対策として維持する
- `hideColumnWebviews` / `recalculateAllBounds` の基本動作: 高さのみ変更、ダイアログ表示時の退避は維持する

## データフロー（修正後）

```
ユーザーがタブをタップ
  → React MobileTabBar の onSelectColumn(id)
  → useColumns.setActiveColumn(id)
  → invoke("resize_column_webview") × 全カラム
     - アクティブ: x=0, y=0, w=innerWidth, h=innerHeight-56 + show()
     - 非アクティブ: x=-99999 + hide()

ダイアログを開く
  → React MobileTabBar の onAddColumn / onAccountManager / onOpenSettings
  → App.tsx の state setter を直接呼び出し
  → hideColumnWebviews() → 全カラムを x=-99999 へ退避
  → React ダイアログ表示（main WebView が全面に）

ダイアログを閉じる
  → recalculateAllBounds()
  → アクティブカラムを h=innerHeight-56 で復元
```

## リスク

- column WebView と React tab bar の境界（y=innerHeight-56 付近）に視覚的な段差が生じる可能性がある。x.com のコンテンツ下端が切れて見える場合は、column WebView 側に `padding-bottom: 56px` を CSS で追加するか、column 高さを `innerHeight` に戻してタブバーと重ねる（タッチ判定は問題ない）ことで対処する。

# 設計: 並び替えボタンのグローバル表示制御 & モバイル時カラム幅設定非表示

**日付:** 2026-05-09  
**ステータス:** 承認済み

---

## 概要

2つの独立した機能改善：

1. **並び替えボタンのグローバル表示制御** — アプリ設定からデスクトップ・モバイル両方の ← → ボタンをON/OFFできる
2. **モバイル時のカラム幅設定非表示** — モバイルでは使用できないカラム幅設定をカラム設定パネルから隠す

---

## Feature 1: 並び替えボタンのグローバル表示制御

### 変更ファイル

#### `src/types/index.ts`
- `GlobalSettings` インターフェースに `showSortButtons: boolean` を追加
- `DEFAULT_GLOBAL_SETTINGS` に `showSortButtons: true` を追加

#### `src/components/AppSettingsPanel/AppSettingsPanel.tsx`
- `useState` で `showSortButtons` を管理
- 「カラムのデフォルト設定」セクション内にチェックボックスを追加:
  - ラベル: 「並び替えボタンを表示する」
- `handleSubmit` に `showSortButtons` を含める

#### `src/components/ColumnHeader/ColumnHeader.tsx`
- `ColumnHeaderProps` に `showSortButtons: boolean` を追加
- ← → ボタン2つを `showSortButtons` で条件付きレンダリング

#### `src/components/MobileTabBar/MobileTabBar.tsx`
- `TabItemProps` と `Props` に `showSortButtons: boolean` を追加
- `TabItem` 内の ← → ボタン2つを `showSortButtons` で条件付きレンダリング
- `MobileTabBar` から `TabItem` へ `showSortButtons` を渡す

#### `src/App.tsx`
- `ColumnHeader` へ `showSortButtons={globalSettings.showSortButtons}` を渡す
- `MobileTabBar` へ `showSortButtons={globalSettings.showSortButtons}` を渡す

---

## Feature 2: モバイル時のカラム幅設定非表示

### 変更ファイル

#### `src/components/SettingsPanel/SettingsPanel.tsx`
- `SettingsPanelProps` に `isMobile: boolean` を追加
- 「カラム」セクション（幅（px）の `<section>`）を `!isMobile` のときのみ表示

#### `src/App.tsx`
- `SettingsPanel` へ `isMobile={isMobile}` を渡す

---

## データフロー

```
GlobalSettings.showSortButtons
  └─> App.tsx
        ├─> ColumnHeader (showSortButtons prop)
        │     └─> ← → ボタンの条件付きレンダリング
        └─> MobileTabBar (showSortButtons prop)
              └─> TabItem (showSortButtons prop)
                    └─> ← → ボタンの条件付きレンダリング

isMobile (useAppStore)
  └─> App.tsx
        └─> SettingsPanel (isMobile prop)
              └─> 幅セクションの条件付きレンダリング
```

---

## エラーハンドリング・後方互換性

- 既存の保存データに `showSortButtons` が存在しない場合、`DEFAULT_GLOBAL_SETTINGS` の `true` が使われるためデフォルト表示が維持される
- `isMobile` は既存の `useAppStore` から取得済みのため新規状態管理は不要

---

## テスト

- `ColumnHeader.test.tsx`: `showSortButtons=false` のときボタンが非表示になることを確認
- `MobileTabBar.test.tsx`: `showSortButtons=false` のときボタンが非表示になることを確認

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

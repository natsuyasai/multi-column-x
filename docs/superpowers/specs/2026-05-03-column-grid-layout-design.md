# カラム縦横グリッド配置機能 — 設計仕様

**日付:** 2026-05-03  
**ステータス:** 承認済み

---

## 概要

現在は横一列のみのカラム配置を、縦×横の任意グリッドに拡張する。  
専用の配置設定タブ（AppSettingsPanel 内）から、グリッドプレビューをクリックしてカラムをセルに割り当てる。高さはデフォルトで均等、任意のサイズ（px または %）に固定することも可能。

---

## データ構造

### `Column` インターフェースへの追加（`src/types/index.ts`）

```typescript
export interface Column {
  // ... 既存フィールド（id, accountId, pageType, width, order, ...）
  gridRow: number;       // グリッド上の行位置（1始まり）
  gridCol: number;       // グリッド上の列位置（1始まり）
  heightMode: "auto" | "fixed";
  heightValue?: number;  // heightMode === "fixed" のときのみ使用
  heightUnit?: "px" | "%"; // heightMode === "fixed" のときのみ使用
}
```

**既存フィールドとの関係:**
- `width` と `order` は引き続き使用する
- `order` はグリッド内での同列内ソート順として使い続ける（gridRow で代替可能だが後方互換のため残す）
- 既存データの移行: `gridRow = 1`, `gridCol = order + 1`（横一列）, `heightMode = "auto"` をデフォルトとする

### `DEFAULT_COLUMN_SETTINGS` は変更しない

`gridRow` / `gridCol` / `heightMode` は `Column` 直下のフィールドであり、`ColumnSettings` ではない。

---

## UI 設計

### AppSettingsPanel へのタブ追加

現在の `AppSettingsPanel` はタブなし（セクション形式）。タブUIを新規追加し、既存コンテンツを「一般」タブに移動した上で「カラム配置」タブを追加する。

| タブ名 | 内容 |
|--------|------|
| 一般 | 既存のセクション（カラムデフォルト設定・ポップアップ設定）をそのまま移動 |
| カラム配置 | **今回追加** |

### カラム配置タブの構成

```
┌─────────────────────────────────────────────┐
│ グリッドサイズ: 行 [N] × 列 [N]             │
├──────────────────────────┬──────────────────┤
│ 配置プレビュー           │ 未割当カラム     │
│                          │                  │
│  [Home]  [通知]  [ + ]  │  [リスト]        │
│  [Search][ + ]   [ + ]  │  [カスタム]      │
│                          │                  │
├──────────────────────────┴──────────────────┤
│ 選択中セルの高さ設定                         │
│ ○ 均等（自動）  ○ 固定: [___] [px / %]     │
├─────────────────────────────────────────────┤
│                                    [適用]    │
└─────────────────────────────────────────────┘
```

#### 操作フロー

1. 行数・列数を入力欄で設定（上限なし、最小 1×1）
2. グリッドプレビューの空セル（`+`）をクリック → 未割当リストが選択モードに
3. 未割当リストのカラムをクリック → そのセルに割り当て
4. 割り当て済みセルをクリック → 選択状態になり高さ設定が下部に表示
5. 高さ設定: 「均等」か「固定（px / %）」をラジオ選択、固定の場合は数値入力
6. 「適用」ボタンで確定 → WebView 再配置

#### 割り当て済みセルの操作

- 割り当て済みセルを再クリック → 高さ設定の編集
- セル上の「×」ボタン → 未割当に戻す

---

## WebView レイアウトエンジン

### 変更対象: `src/hooks/useColumns.ts`

#### 現在の `calculateBounds()` の問題

現在はインデックスベースの横一列計算のみ対応している。

#### 新しい計算ロジック

`recalculateAllBounds()` と `restoreColumns()` が呼ぶ座標計算を以下のように変更する：

```
1. カラムを gridCol でグループ化
2. 各 gridCol グループを gridRow 順にソート
3. x座標: sidebarWidth + 前の gridCol グループの width 合計 - scrollLeft
4. y座標（各カラム）:
   - HEADER_HEIGHT + 同じ gridCol 内の前カラムの実際の高さ合計
5. 高さ計算:
   - heightMode === "auto": (containerHeight - HEADER_HEIGHT - SCROLLBAR_HEIGHT) ÷ 同じgridCol内のautoカラム数
   - heightMode === "fixed" + "px": heightValue そのまま
   - heightMode === "fixed" + "%": (containerHeight - HEADER_HEIGHT - SCROLLBAR_HEIGHT) × heightValue / 100
6. 空きスペース（fixedの合計が containerHeight に満たない場合）: そのまま空白にする
```

#### ヘッダー行の変更

現在のヘッダー行は横一列のスクロールコンテナ。縦積みを追加しても **ヘッダーは各カラムの上端に固定表示** のまま変えない（各 WebView の y = そのカラムの y、ヘッダーは React 側で同じ位置に描画）。

縦積みカラムのヘッダーはそれぞれの WebView の上端に表示する必要があるため：
- 現在の `headerRow`（横スクロールコンテナ内の固定高さ行）を廃止し、各カラムヘッダーを `position: absolute` で `appContent` に対して配置する
- ヘッダーの top 座標 = そのカラムの WebView の y 座標（= `calculateBounds` で求めた y 値）
- ヘッダーの left 座標 = そのカラムの WebView の x 座標（= scrollLeft を反映済みの値）
- `recalculateAllBounds()` 実行時に React state（例: `columnBounds: Record<columnId, {x, y, width, height}>`）を更新し、各ヘッダーの style に反映する
- 横スクロール用の下部スクロールバーと `webview-scroll` イベントのリスナーはそのまま維持

---

## 実装スコープ

### 含むもの

- `src/types/index.ts`: Column に gridRow / gridCol / heightMode / heightValue / heightUnit を追加
- `src/store/useAppStore.ts`: 既存カラムのマイグレーション処理（起動時にデフォルト値補完）
- `src/hooks/useColumns.ts`: calculateBounds → グリッド対応に書き換え
- `src/components/AppSettingsPanel/`: タブ追加 + ColumnLayoutTab コンポーネント新規作成
- `src/App.tsx`: ヘッダー絶対配置対応
- `src/App.module.scss`: レイアウト変更に伴うスタイル

### 含まないもの（スコープ外）

- カラムのドラッグ&ドロップ並び替え（既存の未実装課題のまま）
- グリッドセル間のリサイズハンドル
- グリッド配置のプリセット保存

---

## 既知のトラップ・注意事項

1. **Tauri 子 WebView は z-index 無効** — ダイアログ表示中は全 WebView を x=-9999 に退避する既存ロジックをそのまま流用
2. **Serde camelCase** — Rust 側の `ResizeBounds` に変更は不要（x, y, width, height は既存のまま）
3. **ヘッダー絶対配置への変更** — 現在の `headerRow` はスクロールコンテナと一体化しているため、絶対配置への変更は慎重に行う。スクロール連動が壊れないよう `recalculateAllBounds` でヘッダーの DOM 位置も更新する設計にする

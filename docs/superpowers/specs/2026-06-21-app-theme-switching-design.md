# アプリ本体テーマ切り替え機能 設計

## 概要

Multi Column X のアプリ本体UIに **ダーク / ライト / システム連動** のテーマ切り替え機能を追加する。
ユーザーはアプリ設定から選択でき、選択内容は既存の設定永続化機構で保存される。

## スコープ

### 対象

- 本アプリが描画するシェルUIのみ（TopBar、ColumnHeader、各種ダイアログ、設定パネル等）
- 対象スタイル: `src/index.css`、`src/App.css`、および 15 個の SCSS ファイル

### 非対象

- カラム内 WebView に表示される X/Twitter のページ自体（X のサイトであり本アプリからの制御が困難なため）
- Android ネイティブ側のテーマ（`themes.xml` は変更しない）

## 背景・現状

- `GlobalSettings.theme: "dark" | "light"` は型定義に既に存在し、デフォルトは `"dark"`。
  ただし **UI もスタイル適用も未実装**で、値はどこでも使われていない。
- 本体UIの色は 15 個の SCSS ファイル（+ `index.css` / `App.css`）に **ダーク配色でハードコード**されている。
  CSS 変数は `UpdateDialog.module.scss` が `var(--color-bg, #fff)` / `var(--color-text, #000)` をフォールバック付きで使うのみ。
- Rust 側（`src-tauri/src/commands/settings.rs`）では `theme` は `String` 型として保持。デフォルトは `"dark"`。
- 契約 fixture: `contracts/default-settings.json`（`"theme": "dark"`）。

## 全体アプローチ

セマンティックな CSS 変数トークン + `data-theme` 属性方式を採用する。

1. **セマンティックトークンの定義**: 用途ベースの CSS 変数（後述）を定義する。
2. **テーマ別の値定義**: `:root[data-theme="dark"]` と `:root[data-theme="light"]` の 2 セットで各トークンの値を定義する。
   ベースライン `:root` にはダーク値を置き、初期描画フラッシュを防ぐ（既定が dark のため）。
3. **SCSS のリファクタ**: 各 SCSS のハードコード色を `var(--mcx-*)` に置換する。
4. **属性適用**: `document.documentElement` の `data-theme` 属性を解決済みテーマ（`dark` または `light`）に設定する。

### 不採用案

- **テーマごとに全スタイルを二重定義**: 重複が多く保守性が悪い。
- **主要画面だけ対応**: ライト時に一部ダイアログが崩れるため不完全。

## コンポーネント設計

### 1. テーマトークン（`src/index.css`）

セマンティックトークンを定義する。命名は `--mcx-*` プレフィックス。想定トークン（実装時に既存配色を棚卸しして確定）:

| トークン                | 用途                   | dark 例          | light 方向性   |
| ----------------------- | ---------------------- | ---------------- | -------------- |
| `--mcx-app-bg`          | アプリ最背面           | `#000`           | 明るい灰白     |
| `--mcx-surface`         | パネル/カード背景      | `#1a1a1a`        | 白             |
| `--mcx-surface-2`       | 一段濃い面/入力欄      | `#0f0f0f` 系     | 薄灰           |
| `--mcx-text`            | 主要テキスト           | `#f6f6f6`        | 濃い灰         |
| `--mcx-text-muted`      | 補助テキスト           | `#aaa` / `#555`  | 中間灰         |
| `--mcx-border`          | 境界線                 | `#333`           | 薄灰境界       |
| `--mcx-accent`          | アクセント（X ブルー） | `#1d9bf0`        | 同系（共通可） |
| `--mcx-accent-hover`    | アクセント hover       | `#396cd8` 等     | 同系           |
| `--mcx-overlay`         | ダイアログ遮蔽         | `rgba(0,0,0,.6)` | 同系（調整可） |
| `--mcx-scrollbar-track` | スクロールバー溝       | `#0a0a0a`        | 薄灰           |
| `--mcx-scrollbar-thumb` | スクロールバーつまみ   | `#333`           | 中灰           |

> トークン数・正確な値は、実装時に 15 ファイルの実色を棚卸しして最終確定する。上表は方針提示。

### 2. テーマ解決フック（`src/hooks/useTheme.ts`）

責務: `globalSettings.theme` を解決済みテーマに変換し、`document.documentElement` の `data-theme` に反映する。

- 入力: `theme: "dark" | "light" | "system"`
- 解決:
  - `"dark"` → `dark`
  - `"light"` → `light`
  - `"system"` → `matchMedia('(prefers-color-scheme: dark)').matches` で `dark`/`light` に解決
- `"system"` 選択中は `matchMedia` の `change` イベントを購読し、OS 配色変更にライブ追従する。
- アンマウント/テーマ変更時にリスナを解除する。

純粋な解決ロジック（`theme` + `systemPrefersDark` → `"dark" | "light"`）を関数として切り出し、単体テスト可能にする。

### 3. 設定UI（`src/components/AppSettingsPanel/AppSettingsPanel.tsx`）

- 「表示」セクションに、`columnScale` と同じボタン群UIで **ダーク / ライト / システム** の 3 択セレクタを追加。
- ローカル state `theme` を `settings.theme` で初期化し、`handleSubmit` の `onApply` パッチに `theme` を含める。

### 4. 型・契約

- `src/types/index.ts`: `GlobalSettings.theme` を `"dark" | "light" | "system"` に拡張。
- `DEFAULT_GLOBAL_SETTINGS.theme` は `"dark"` のまま。
- Rust 側は `String` のため変更不要。デフォルトも `"dark"` のままで、契約 fixture (`contracts/default-settings.json`) は変更なし。

## データフロー

```
設定UI(3択) --onApply--> useAppStore.updateGlobalSettings({theme})
   --> saveSettings() で永続化
   --> globalSettings.theme 変化
   --> useTheme が解決 --> documentElement[data-theme] 更新
   --> CSS 変数が切り替わり全シェルUIに反映
```

`"system"` 時は OS 配色変更 → matchMedia change → useTheme が再解決 → `data-theme` 更新。

## エラーハンドリング

- `matchMedia` 非対応環境（理論上）でも落ちないよう、未対応時は `light` 既定にフォールバック。
- 不正な `theme` 値（旧データ等）は解決ロジックで `dark` にフォールバック。

## テスト方針

t-wada 推奨の TDD で進める。テストケース名は日本語。

- **テーマ解決関数**: dark/light/system×OS明暗、未対応フォールバック、不正値フォールバック。
- **useTheme フック**: `data-theme` 属性の設定、system 時の matchMedia 購読とライブ追従、クリーンアップ。
- **設定UI**: 3 択ボタンの選択状態と `onApply` に渡る `theme` 値。
- **型/契約**: 既存の `defaults.contract.test.ts` が緑のままであること（既定 dark 維持）。
- CSS の見た目は単体テスト対象外。`npm run tauri:dev` で dark/light/system を目視確認。

## 作業分割（コミット単位の想定）

CLAUDE.md「1 度に 1 つ」「作業毎にコミット」に従い、概ね以下の粒度で進める。

1. 型拡張（`theme` union に `system` 追加）
2. テーマ解決関数 + テスト
3. `useTheme` フック + テスト、App への組み込み
4. CSS 変数トークン定義（dark/light）
5. SCSS リファクタ（ハードコード色 → `var(--mcx-*)`）
6. 設定UI 3 択追加 + テスト
7. 目視確認・最終フォーマッタ/テスト

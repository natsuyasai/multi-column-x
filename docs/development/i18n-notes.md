# 多言語対応（i18n）ノート

画面文言を日本語・英語で切り替えるための仕組みと規約。基盤は `i18next` + `react-i18next`。辞書は `src/locales/{ja,en}/<名前空間>.json`、初期化は `src/i18n/index.ts`、辞書の登録は `src/i18n/resources.ts`。表示言語は設定 `language`（`auto` / `ja` / `en`）で決まる（`src/lib/language.ts`）。

## 現状の対応範囲

- React UI（`src` 配下の画面文言）が対象。
- **Rust／inject／Android 由来の文言は PR3 以降で対応中で、当面は日本語のまま**。Rust が返して UI に出る文字列（バックアップの `error.field` / `error.reason`、拡張機能の結果文言など）も同様。移行対象外なので触らない。
- 対象外: ユーザーガイド、WhatsNew の更新履歴本文。

## 規約

1. **常に名前空間付きの完全キーで書く**: `t("settings:general.autoReload.label")`。`useTranslation()` は引数なしで呼ぶ（`useTranslation("settings")` は使わない）。未使用キー検出テスト（`t("ns:key")` の静的走査）と型安全キーのため。
2. **キー形式**: 名前空間 + camelCase のネスト（`ns:area.item.part`）。ja 辞書を基準に型が決まる。ja と en は常に同じキー集合・同じ補間変数（`resources.contract.test.ts` が検査）。
3. **補間**: `{{name}}`。件数を含む文言は i18next の複数形（`key_one` / `key_other`）。日本語と英語で語順が変わる文はキーを分けず、1キー内で語順を訳文側に持たせる。
4. **JSX 内に要素を含む文**（`<strong>` やリンク等）は `<Trans i18nKey="ns:key" components={{ ... }} />`。
5. **属性**（`title` / `aria-label` / `placeholder` / `alt`）も辞書化する。画面外の `aria-label` も対象。
6. **React 外**（store・非 hook 関数・通知コールバック）は `import i18n from "@/i18n"` して**呼び出し時に** `i18n.t("ns:key")`。モジュール直下の定数に翻訳結果を入れない（言語切替に追従しなくなる）。メッセージ定数は関数にする。
7. **純粋関数・constants**: 関数は `t: TFunction`（`import type { TFunction } from "i18next"`）を引数に追加して返す（例: `getPageTypeLabel(input, t)`）。ラベル表は日本語文字列ではなくキーを持つ形にする。テストでは `i18n.t`（ja 固定）を渡す。
8. **永続化される既定名**（`アカウント N` など保存される値）は、作成時の言語で `i18n.t` して保存する。表示時に導出される文言は表示時に翻訳する。
9. **翻訳しない**: 製品名「Multi Column X」、`X` / `@ID` / URL / ファイル名、ショートカットキー表記。X の DOM から読み取る・X へ送る文字列。
10. **日本語文言は一字一句変えない**（日本語表示の回帰ゼロ）。コメント内の日本語は触らない。
11. UI 寸法は rem（px 禁止）。

画面コードへの日本語の直書きは ESLint（`no-restricted-syntax`）で検出される。

## 名前空間

| 名前空間         | 用途                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `common`         | 共通語（言語名など）                                                                      |
| `settings`       | AppSettingsPanel 全体（全般・表示・レイアウト・プリセット・情報・拡張機能・バックアップ） |
| `columnSettings` | カラム設定パネル（SettingsPanel）                                                         |
| `columns`        | カラム追加ダイアログ・カラムヘッダー・ページ種別ラベル                                    |
| `topbar`         | ツールバー                                                                                |
| `mobile`         | MobileTabBar                                                                              |
| `accounts`       | アカウント管理・アカウント名・未登録案内                                                  |
| `dialogs`        | 更新・H.264・ショートカット・確認・リンクポップアップ・タブ操作・WhatsNew の枠            |
| `rateLimit`      | API レート制限表示（バケット名・説明・状態）                                              |
| `messages`       | hooks・store・通知・バックアップエラー等の非 UI 文言                                      |

名前空間を追加したら `src/i18n/index.ts` の `ns` 配列と `src/i18n/resources.ts`（ja・en 両方）を更新する。型は resources から導出されるので `i18next.d.ts` は通常変更不要。

## 英訳の用語集

| 日本語                                     | English                                      |
| ------------------------------------------ | -------------------------------------------- |
| カラム                                     | Column                                       |
| ホーム／通知／検索／リスト                 | Home／Notifications／Search／Lists           |
| カスタム／外部サイト                       | Custom／External site                        |
| 投稿（作成）                               | Compose（ボタンは "Post"）                   |
| ポスト／リポスト／いいね                   | Post／Repost／Like                           |
| アカウント                                 | Account                                      |
| プリセット                                 | Preset                                       |
| 設定／適用／キャンセル／閉じる／削除／保存 | Settings／Apply／Cancel／Close／Delete／Save |
| NGワード                                   | Muted words                                  |
| 自動更新                                   | Auto-reload                                  |
| ポップアップ                               | Popup                                        |
| 拡張機能                                   | Extensions                                   |
| バックアップ／復元                         | Backup／Restore                              |
| 表示サイズ                                 | Display size                                 |
| 端末に合わせる                             | Match device                                 |
| 小／標準／大／特大                         | Small／Standard／Large／Extra large          |

用語集にない語を訳したら、ここに追記して統一する。

## 新規文言を追加する手順

1. `src/locales/ja/<ns>.json` にキーを追加する（日本語）。
2. `src/locales/en/<ns>.json` に同じキー・同じ補間変数で英訳を追加する。
3. 画面コードで `t("ns:key")` を使う。
4. 契約テストを通す: `npx vitest run --project unit src/i18n`。
   - `resources.contract.test.ts`: ja と en のキー集合・補間変数の一致
   - `unusedKeys.contract.test.ts`: 辞書の全キーがソースから参照されている（未使用キーは失敗）

動的キーは ``t(`common:language.${value}`)`` のように**接頭辞が名前空間付きで先頭に書かれた**テンプレートリテラルにする（接頭辞に前方一致するキーは使用済みとみなされる）。キー全体を変数に入れて渡す書き方は検出できないので避ける。

## i18next の使い方

```tsx
// コンポーネント内
const { t } = useTranslation();
<label>{t("settings:language.label")}</label>;

// 要素を含む文
<Trans i18nKey="dialogs:update.body" components={{ strong: <strong /> }} />;

// React 外（呼び出し時に評価する）
import i18n from "@/i18n";
const message = () => i18n.t("messages:settingsLoadFailed");

// 純粋関数は t を引数で受ける
import type { TFunction } from "i18next";
export function getLabel(type: PageType, t: TFunction): string {
  return t(`columns:pageType.${type}`);
}
```

## テスト補助

`src/test-utils/japanese.ts` の `expectNoJapanese(root)` は、描画結果のテキストノードと `title` / `aria-label` / `placeholder` / `alt` 属性、button/input の `value` 属性から日本語を探し、見つかった文言を列挙して失敗する。英語表示のテストで使う。

```tsx
await act(() => i18n.changeLanguage("en"));
const { container } = render(<Component />);
expectNoJapanese(container);
```

テスト後は `i18n.changeLanguage("ja")` で言語を戻すこと。

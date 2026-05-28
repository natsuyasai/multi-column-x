# キーボードショートカット拡張 設計書

Date: 2026-05-28

## 概要

TopBar の各操作および左から n 番目のカラムへのジャンプを、キーボードショートカットで実行できるようにする。
Ctrl+T（ツイート作成）は実装済みのため、残りの操作を追加する。

WebView にフォーカスがある場合でも動作するよう、inject スクリプト → Rust コマンド → Tauri イベント経由で
メインウィンドウへ転送する既存の仕組みを踏襲する。

## ショートカットキー一覧

| キー         | 操作                            | 備考                                     |
| ------------ | ------------------------------- | ---------------------------------------- |
| Ctrl+T       | ツイート作成                    | 実装済み                                 |
| Ctrl+L       | URLをポップアップで開く         | link の L                                |
| Ctrl+N       | カラム追加                      | new の N                                 |
| Ctrl+Shift+A | アカウント管理                  | Ctrl+A は全選択と競合するため Shift 付き |
| Ctrl+,       | アプリ設定                      | 多くのアプリで設定に使われる慣習キー     |
| Ctrl+B       | トップバー展開/折りたたみ       | bar の B                                 |
| Ctrl+1〜9    | 左から n 番目のカラムへジャンプ | `column.order` 昇順で 1=最左カラム       |

## アーキテクチャ

### データフロー

```
[メインウィンドウにフォーカス]
  window keydown → useKeyboardShortcuts → コールバック実行

[カラム WebView にフォーカス]
  WebView keydown
    → keyboard_shortcut.js (inject)
    → invoke("report_keyboard_shortcut", { key })
    → Rust: emit("webview-keyboard-shortcut", key)
    → useKeyboardShortcuts: listen() → コールバック実行
```

Ctrl+1-9 はメインウィンドウ側でのみ処理する（`columns` 配列が必要なため inject では扱わない）。

### 無効化ルール

`disabled` フラグが `true` のとき（= `dialogOpen` のとき）、すべてのショートカットを無効化する。
App.tsx から `useKeyboardShortcuts({ ..., disabled: dialogOpen })` として渡す。

## 変更ファイル一覧

### TypeScript

| ファイル                                 | 変更内容                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| `src/hooks/useKeyboardShortcuts.ts`      | オプション拡張・各ショートカット追加・`disabled` 対応 |
| `src/hooks/useKeyboardShortcuts.test.ts` | 各ショートカットのテスト追加・`disabled` テスト追加   |
| `src/App.tsx`                            | 新コールバックと `disabled={dialogOpen}` を渡す       |

### Rust / inject

| ファイル                                    | 変更内容                                                |
| ------------------------------------------- | ------------------------------------------------------- |
| `src-tauri/src/inject/keyboard_shortcut.js` | Ctrl+L / Ctrl+N / Ctrl+Shift+A / Ctrl+, / Ctrl+B を追加 |

`report_keyboard_shortcut` コマンド・`webview-keyboard-shortcut` イベントは既存のまま。
新キー種別文字列（`open_link_popup` 等）をペイロードに追加するだけ。

## テスト方針

- TDD（Red → Green → Refactor）で進める
- 各ショートカットキーに対して「押すとコールバックが呼ばれる」テストを 1 つずつ追加
- `disabled=true` のとき全ショートカットが無効になることを確認するテストを追加
- inject スクリプト経由（listen）のテストは `compose_tweet` と同パターンで各キーに追加
- アンマウント後のリスナー解除はまとめて 1 ケースで確認

## 非対応事項

- Ctrl+1-9 の inject スクリプト対応（columns 配列への依存があるため対応しない）
- モバイル（Android）での Ctrl+1-9 対応（デスクトップのみ）

# Multi Column X

[![CI](https://github.com/natsuyasai/multi-column-x/actions/workflows/ci.yml/badge.svg)](https://github.com/natsuyasai/multi-column-x/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/natsuyasai/multi-column-x)](https://github.com/natsuyasai/multi-column-x/releases/latest)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Android-blue)
![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB)

TweetDeck スタイルの Twitter/X クライアント。複数アカウント・複数カラムを同時に並べて表示できる、Tauri v2 製のデスクトップ / Android アプリです。

## 特長

- **マルチアカウント対応** — アカウントごとに独立したセッション（Cookie）を保持
- **カラムレイアウト** — ホーム・通知・検索・リスト・カスタム URL・投稿専用・外部 URL（アカウント非依存）を任意の数だけ並べて表示
- **グリッドレイアウト** — `gridRow` / `gridCol` でカラムをマトリクス状に配置。列内での縦積みに対応
- **カラム設定** — 各カラムごとに自動更新間隔・ヘッダー非表示・カスタム CSS を設定可能
- **自動更新** — 設定した間隔で自動リロード。スクロール中は更新をスキップ
- **前回の境目へ戻るボタン** — ホームカラムで自動更新により新着が入った際、更新前の先頭（既読との境目）へワンタップで戻れる
- **メディアポップアップ** — 画像・動画リンクを別ウィンドウで開く
- **動画長押しメニュー** — カラム上の動画を長押し（PC は右クリック）でポップアップ表示・ダウンロード（ダウンロードは Android のみ）
- **リンクポップアップ** — 任意の URL を専用ウィンドウで開く
- **ツイート投稿ウィンドウ** — TopBar / モバイルタブバーからツイート作成ウィンドウを開く
- **ポップアップセッション切替** — ポップアップウィンドウのアカウントをその場で切り替え
- **カスタムコンテキストメニュー** — WebView 右クリックメニューを拡張
- **動画自動再生停止** — ページ読み込み時に動画の自動再生を停止
- **NG ワード / ホワイトリスト** — カラム別・グローバルの NG ワードでタイムラインをフィルタ、ホワイトリスト指定時は該当ワードを含む投稿のみ表示
- **リポスト非表示** — 指定ユーザーのリポストをカラム別・グローバルで非表示
- **通知ページのヘッダー非表示** — 通知カラムの設定リンクを含むヘッダーを自動的に非表示
- **画像の縮小・ぼかし表示 / 広告非表示** — カラムごとのタイムライン表示調整
- **新着バッジ・デスクトップ通知** — カラムごとの新着件数バッジ、通知カラムのデスクトップ通知
- **API レート制限モニター** — X 内部 API のレート制限状況をツールバーのポップオーバーに表示
- **キーボードショートカット** — 投稿・カラム追加・カラム 1-9 ジャンプなど（カラム WebView フォーカス中も有効）
- **テーマ切替** — ダーク / ライト / システム連動
- **プリセット** — カラム構成の保存・切り替え（デスクトップ）
- **TopBar ナビゲーション** — 横方向ツールバーでカラム追加・アカウント管理・設定を操作、ドラッグ＆ドロップでカラムを列単位に並び替え（デスクトップ）
- **自動アップデート** — GitHub Releases からの更新確認・適用と What's New 表示（デスクトップ / Android APK）
- **クラッシュ自動復旧** — Linux の WebProcess クラッシュを検知してカラム WebView を自動再生成
- **Android 対応** — モバイルタブバー UI・スワイプバーでカラムを切り替え表示、広い画面（タブレット・横向き）では 2 カラム同時表示にも対応

## ダウンロード・インストール

[Releases](https://github.com/natsuyasai/multi-column-x/releases/latest) から OS に合ったファイルをダウンロードして実行してください。

| OS      | 配布物         |
| ------- | -------------- |
| Windows | インストーラ   |
| Linux   | AppImage / deb |
| Android | APK            |

インストール手順や初回セットアップの詳細は [利用ガイド](docs/USER_GUIDE.md) を参照してください。インストール後は、アプリ内の自動アップデートで最新版に更新できます。

## 使い方

1. アカウントを追加する（ツールバーの「アカウント」→「＋ アカウントを追加」→ X にログイン）
2. カラムを追加する（ツールバーの「カラム追加」でアカウントとページタイプを選択）
3. グリッド配置・自動更新・NG ワードなどを必要に応じて設定する

画面の見方・設定項目・ショートカット・Android での操作・FAQ は [利用ガイド](docs/USER_GUIDE.md) にまとめています。

## 技術スタック

| 層             | 技術                            |
| -------------- | ------------------------------- |
| フロントエンド | React 19 + TypeScript + Vite    |
| スタイル       | SCSS Modules                    |
| 状態管理       | Zustand                         |
| バックエンド   | Rust + Tauri v2                 |
| 設定永続化     | tauri-plugin-store v2           |
| テスト         | Vitest + @testing-library/react |

## 開発

### 必要なもの

- [Node.js](https://nodejs.org/) 22 以上
- [Rust](https://rustup.rs/) / Cargo
- [Tauri の前提条件](https://tauri.app/start/prerequisites/)（WebView2 など）

Windows で Cargo が見つからない場合は、PATH に `%USERPROFILE%\.cargo\bin` を追加してください。

### セットアップと起動

```bash
npm install
npm run tauri:dev
```

### ビルド

```bash
npm run tauri:build          # リリースビルド
npm run tauri:build:debug    # デバッグビルド
npm run tauri:android:build  # Android ビルド
```

### テスト・品質チェック

```bash
npm test                     # Vitest 単体テスト
npm run test:property        # fast-check プロパティテスト
npm run test:story           # Storybook play function（chromium）
npm run lint                 # ESLint
npm run typecheck            # tsc --noEmit
npm run lint:rust            # cargo clippy（-D warnings）
cd src-tauri && cargo test   # Rust 単体テスト
```

## ドキュメント

| ドキュメント                                                          | 内容                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| [利用ガイド](docs/USER_GUIDE.md)                                      | アプリの使い方（利用者向け）                                 |
| [開発ノート一覧](docs/development/README.md)                          | 設計判断・落とし穴・仕様の背景（開発者向け）                 |
| [プロジェクト構成](docs/development/project-structure.md)             | `src/` / `src-tauri/` / Android Kotlin 層のファイル構成      |
| [Tauri コマンド一覧](docs/development/tauri-commands.md)              | アプリ独自コマンドと ACL 更新ルール                          |
| [アーキテクチャ上の注意点](docs/development/architecture-overview.md) | WebView・remote capability・更新セキュリティ・条件コンパイル |
| [Linux カラム WebView 仕様](docs/development/linux-column-spec.md)    | 配置・クリッピング・クラッシュ対策・GStreamer 同梱           |
| [CLAUDE.md](CLAUDE.md)                                                | 開発ガイドライン・アーキテクチャ上の制約                     |

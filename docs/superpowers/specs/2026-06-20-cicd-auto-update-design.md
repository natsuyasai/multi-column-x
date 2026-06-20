# CI/CD + 自動更新 設計書（Windows / Linux / Android）

- 作成日: 2026-06-20
- 対象: Multi Column X（Tauri v2 / React 19 + Rust）
- 配布元: GitHub Releases（リポジトリを public 化）

## 1. 目的とスコープ

GitHub Actions による CI/CD でリリース成果物を自動ビルド・保持し、インストール済み環境へ
自動更新を配信する。更新可否はポップアップで選択でき、キャンセル時は次バージョンの
リリース時、または任意の手動確認時に再度更新できる。

対象プラットフォーム: **Windows / Linux / Android**

### 確定した方針（ブレインストーミング結果）

- リポジトリを **public** 化し、GitHub Releases を配布・更新エンドポイントにする。
- **OS コード署名なし**（Windows SmartScreen 警告は許容）。Tauri updater の minisign 署名は必須で導入。
- **Android はアプリ内 APK 自己更新**（GitHub Releases の APK を DL → インストーラ起動）。
- 更新チェックは **起動時自動 + 設定画面の手動ボタン**。
- キャンセル時はそのバージョンを再通知せず、**次の新バージョン or 手動確認**で再表示。

### 非対象（YAGNI）

- Google Play / ストア配信、Play In-App Updates。
- macOS / iOS 対応。
- 差分（delta）更新、ロールバック機構。
- 定期バックグラウンドチェック（起動時 + 手動のみ）。

## 2. 全体アーキテクチャ

```
[git tag v*] --push--> GitHub Actions (release.yml)
   ├─ create-release（draft 作成・release_id 出力）
   ├─ desktop (matrix: windows / ubuntu)  → tauri-action でビルド & latest.json 署名添付
   ├─ android (ubuntu)                     → 署名済み APK ビルド & 添付
   └─ publish-release（全ジョブ成功後に draft を公開）

[インストール済みアプリ起動 / 手動ボタン]
   ├─ desktop: tauri-plugin-updater → latest.json 取得・署名検証 → DL & インストール → 再起動
   └─ android: GitHub Releases API で最新 tag 比較 → APK DL → FileProvider インストーラ起動
   共通 UI: React の UpdateDialog（更新する / 後で）
```

更新フローのプラットフォーム差は `src/services/updater.ts` の単一インターフェース背後に隠蔽する。

## 3. リリース CI/CD

### 3.1 既存 CI（変更なし）

`.github/workflows/ci.yml`（PR / main push 時の lint・test）は現状維持。

### 3.2 リリースワークフロー `.github/workflows/release.yml`

- **トリガー**: `push: tags: ['v*']`（例 `v0.2.0`）。手動 `workflow_dispatch` も補助的に許可。
- **ジョブ**:
  1. `create-release`（ubuntu）: `tauri.conf.json` の version を読み、`v{version}` の **draft** Release を作成し `release_id` を outputs に出す。タグと version の不一致時は fail。
  2. `desktop`（matrix: `windows-latest`, `ubuntu-latest`）:
     - `tauri-apps/tauri-action` でビルドし、`release_id` の Release に成果物 + 署名付き `latest.json` を添付。
     - 署名用 env: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
     - Linux 依存（`libwebkit2gtk-4.1-dev` 他）を ci.yml と同様にインストール。
     - 生成物: Windows = NSIS `.exe`（更新対応） / Linux = AppImage（更新対応）+ deb（手動 DL 用）。
  3. `android`（ubuntu）:
     - JDK 17 + Android SDK/NDK セットアップ、Secrets からキーストアを復元（3.4）。
     - `tauri android build`（release, universal）で署名済み APK を生成し、`gh release upload` で Release に添付。
  4. `publish-release`（ubuntu, needs: desktop, android）: draft Release を publish に切り替える。
- **CI アーティファクト保持**: 各ビルドジョブで `actions/upload-artifact` により成果物を保持（Release とは別に保存）。

### 3.3 Tauri updater 署名鍵（minisign）

- `tauri signer generate` で生成。
- **公開鍵** を `tauri.conf.json > plugins.updater.pubkey` に記載（コミット対象）。
- **秘密鍵 / パスワード** を GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` に格納（コミット禁止）。

### 3.4 Android 署名（既存鍵を流用）

- ローカルに既存のリリースキーストア（`upload-keystore.jks` / alias `upload`、store・key 同一パスワード）と
  `src-tauri/gen/android/keystore.properties`（gitignore 済み）がある。`build.gradle.kts` の
  `signingConfigs.release` は `keystore.properties` を読む既存構成を維持する。
- CI 用 Secrets:
  - `ANDROID_KEYSTORE_BASE64`: `upload-keystore.jks` を base64 化した値。
  - `ANDROID_KEYSTORE_PASSWORD`: store/key 共通パスワード。
  - `ANDROID_KEY_ALIAS`: 鍵エイリアス（`upload`）。
- CI ステップでキーストアを base64 デコードして配置し、`keystore.properties` を生成してから
  `tauri android build` を実行する。
- **重要（既存鍵の継続利用）**: 自己更新は APK 署名鍵の一致が前提。既存 `upload-keystore.jks` を
  以後も使い続ける（鍵が変わると Android が署名不一致で更新を拒否し、再インストールが必要になる）。

## 4. デスクトップ自動更新（Tauri updater）

### 4.1 依存・設定

- 追加プラグイン: `tauri-plugin-updater`、`tauri-plugin-process`（再起動）。
- フロント: `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`。
- `tauri.conf.json`:
  ```jsonc
  "plugins": {
    "updater": {
      "pubkey": "<minisign public key>",
      "endpoints": [
        "https://github.com/natsuyasai/multi-column-x/releases/latest/download/latest.json"
      ]
    }
  }
  ```
- capabilities に updater / process の権限を付与。

### 4.2 動作

1. `check()` で `latest.json` を取得・署名検証し、利用可能な更新を得る。
2. UpdateDialog で「更新する」を選んだら `downloadAndInstall()`（進捗表示）。
3. 完了後 `relaunch()` で再起動。

## 5. Android 自動更新（自前実装）

### 5.1 更新確認

- GitHub Releases API `GET /repos/natsuyasai/multi-column-x/releases/latest` を取得し、
  `tag_name`（`v{semver}`）を現在の `version` と semver 比較する。
- 比較・APK アセット選択ロジックは純粋関数化（テスト対象、6章）。

### 5.2 ダウンロードとインストール

- Release アセットから universal APK の `browser_download_url` を取得し、端末のアプリ専用領域へ DL。
- `MainActivity.installApk(path: String)` を Rust 経由（JNI ブリッジ）で呼び出す:
  - `FileProvider` で APK の content URI を生成。
  - `Intent(ACTION_VIEW)` + `application/vnd.android.package-archive` + `FLAG_GRANT_READ_URI_PERMISSION` でインストーラ起動。
- 必要な追加:
  - `AndroidManifest.xml`: `REQUEST_INSTALL_PACKAGES` 権限、`FileProvider` の `<provider>` 定義と `file_paths.xml`。
  - JNI ブリッジ（`AppBridge`/`android_bridge.rs`）に `installApk` を追加。
- **CLAUDE.md 制約**: `MainActivity` のメソッドを `env.call_method()` で呼ぶ場合、`proguard-rules.pro` に
  keep ルールを同期追加する（R8 難読化対策）。

### 5.3 権限とフォールバック

- 「提供元不明アプリのインストール」許可が必要。未許可時は設定画面（`ACTION_MANAGE_UNKNOWN_APP_SOURCES`）へ誘導する。

## 6. 共通の更新 UX（React）

### 6.1 コンポーネント / フック

- `UpdateDialog`: 「更新する」「後で」。新バージョン番号とリリースノートを表示。アプリ既存の
  ダイアログスタイルに合わせる。表示中は `App.tsx` の `dialogOpen` に統合し、Android では
  `hideColumnWebviews()` で WebView を退避（既存の z-index 退避挙動に準拠）。
- `useAppUpdater`: 起動時チェックと手動チェックを提供。プラットフォーム分岐は `services/updater.ts` に委譲。
- `AppSettingsPanel` に「更新を確認」ボタンと現在バージョン表示を追加。

### 6.2 再通知ルール（キャンセル時の挙動）

- `tauri-plugin-store` に `dismissedUpdateVersion` を保存。
- **起動時自動チェック**: `isAvailable(latest, current) && latest !== dismissedUpdateVersion` のときだけダイアログ表示。
- 「後で」押下: `dismissedUpdateVersion = latest` を保存して閉じる。
- 新バージョンが出ると `latest !== dismissed` となり再び表示される。
- **手動チェック**: `dismissedUpdateVersion` を無視して必ず結果表示（更新なしの場合も「最新です」を表示）。
- 「更新する」押下: 更新実行（desktop=DL&install&relaunch / android=DL&installer 起動）。

### 6.3 サービスインターフェース（`src/services/updater.ts`）

```ts
interface AppUpdate {
  version: string;
  notes?: string;
}
interface Updater {
  check(): Promise<AppUpdate | null>; // 更新が無ければ null
  install(update: AppUpdate): Promise<void>; // desktop=install+relaunch / android=DL+installer
}
```

- desktop 実装: `@tauri-apps/plugin-updater` をラップ。
- android 実装: GitHub Releases API + Rust コマンド（DL）+ JNI（installApk）をラップ。
- `isMobile` で実装を切替。

## 7. バージョニング

- 単一の真実: `src-tauri/tauri.conf.json` の `version`（および `package.json`）。
- Android の `versionCode` / `versionName` は `tauri.properties` 経由で tauri が生成（既存構成）。
- リリースタグ `v{version}` と `tauri.conf.json` の version 一致を `create-release` で検証。
- semver 比較ユーティリティを共通化し、`latest > current` 判定に用いる。

## 8. テスト方針

- **純粋ロジック（Vitest, TDD）**:
  - semver 比較（`latest > current`）。
  - 再通知判定（`isAvailable && latest !== dismissed`、手動時は無視）。
  - GitHub Releases API レスポンスからの version 抽出 / APK アセット選択。
- **updater サービス**: desktop/android 実装をモックし、分岐とダイアログ連携を検証。
- **Kotlin 単体テスト（`:app:testUniversalDebugUnitTest`）**: `installApk` のパス/URI 組み立て等の
  ロジック（Android API 非依存部分）を検証。
- **ワークフロー**: 段階導入。まず build & artifact を回し、署名・Release 公開は Secrets 投入後に検証。

## 9. 実装順序（サブプロジェクト）

1. **リリース CI/CD**: `release.yml`（build & artifact）+ Android キーストア復元。Release 作成まで。
2. **デスクトップ更新**: updater/process 導入、`tauri.conf.json` 設定、desktop updater 実装。
3. **更新 UX**: `UpdateDialog` / `useAppUpdater` / 設定画面ボタン / 再通知ルール。
4. **Android 更新**: GitHub API チェック + APK DL + `installApk`（JNI / FileProvider / 権限 / proguard 同期）。

各サブプロジェクトは独立して PR 化・コミット可能。1→4 の順で依存。

## 10. 事前準備（ユーザー作業 / Secrets）※コミット禁止

- リポジトリを public 化。
- Tauri updater 鍵を生成し、公開鍵を config に、秘密鍵/パスワードを Secrets に登録:
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- Android Secrets を登録: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`。
- 既存 `upload-keystore.jks` を以後も使い続ける（鍵を変更しない）。

## 11. リスク・留意点

- **matrix での latest.json マージ**: windows/linux 各ジョブが同一 Release に書き込むため、
  tauri-action の updater json 生成が両プラットフォームを含むよう構成する（マージ動作の検証が必要）。
- **Linux 更新は AppImage 限定**: deb/rpm は Tauri updater 非対応。自動更新対象は AppImage のみ。
- **Windows 未署名**: 初回起動時 SmartScreen 警告（許容方針）。
- **Android 署名不一致**: 既存鍵の継続が必須。鍵を失うと更新不可（要再インストール）。
- **public 化**: 既存コミット履歴・秘密情報の混入がないか公開前に確認（keystore.properties / jks は gitignore 済み）。

```

```

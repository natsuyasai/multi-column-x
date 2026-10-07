# 設定・アカウント・カラムのバックアップ／リストア 設計調査レポート（Issue #206）

調査日: 2026-10-08 / 対象: `develop`（1ac58dc）。実装コードの変更は行っていない。

凡例: **[事実]** コードで確認した内容（場所付き）／ **[推測]** コードから推論した内容・未検証／ **[要検証]** 実機確認が必要な内容。
公式ドキュメントとの照合（Web 検索）と P3（他クライアント調査）は本セッションでは実施していない。該当箇所は末尾「未実施事項」に記載した。

---

## 0. 結論サマリ

| #   | 項目         | 推奨                                                                                                                                                                                                                        |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 形式         | UTF-8 JSON 1ファイル（拡張子 `.mcxbackup.json`）。`format`/`schemaVersion`/`appVersion`/`exportedAt` を持つエンベロープ。`accounts` は **Cookie・dataDirectory を含まず**、`{backupAccountId, label, color, xUserId?}` のみ |
| 2   | 紐づけ       | カラムの `accountId` を「バックアップ内アカウント → 復元先アカウント」の対応表で差し替え。`xUserId` 一致は初期候補。**ただし現状 `xUserId` は新規追加アカウントでは埋まらない**（後述）ため、まず取得経路を整備する         |
| 3   | 端末依存     | `windowBounds`、`pendingDataDirectoryDeletions`、各アカウントの `dataDirectory`/`createdAt`、`defaultAccountId`（紐づけで変換）を除外／変換                                                                                 |
| 4   | 未紐づけ     | **「該当カラムを復元しない」を既定**（スキップ）。紐づけゼロは復元不可（形式仕様の `mapping.size > 0` と一致）                                                                                                              |
| 5   | 既存データ   | **全置換**を採用。ただしリストア直前に現在の `settings.json` を自動退避し、確認ダイアログを出す                                                                                                                             |
| 6   | ファイル I/O | desktop: `tauri-plugin-dialog`（導入済）＋ Rust 側 fs。Android: SAF（`CreateDocument`/`OpenDocument`）を `MainActivity.kt` に追加（動画保存の SAF 実装が前例）                                                              |

---

## 1. バックアップのデータ形式（P1-1）

### 現状 [事実]

- 永続化は `tauri-plugin-store` の `settings.json` の `appSettings` キー1つ。中身は `AppSettings { accounts, columns, globalSettings }`（`src/types/index.ts:105-109`、Rust 側 `AppSettingsData`）。
- 保存は `save_settings`（`src-tauri/src/commands/settings.rs:521`）→ `save_store_atomically`（`settings_file.rs:81`）。読み込みは `load_settings`（`settings.rs:483`）。両方 `require_main_caller` 付き。
- Cookie などのログイン状態は `settings.json` ではなくアカウントごとの `dataDirectory`（WebView プロファイル）にある。**したがって `AppSettings` を丸ごとエクスポートしても Cookie は入らない**が、`Account.dataDirectory` は端末固有パスなので含めると害になる。
- 既定値の二重定義と契約テストがある（`contracts/default-settings.json`）。`#[serde(default)]` により欠落フィールドは既定値で補われる（`settings-missing-key-defaults.feature`）。

### 含める／除外する項目

| 項目                                           | 扱い                           | 理由                                                                                              |
| ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `accounts[].id`                                | `backupAccountId` として含める | カラムの参照キー。復元先では使わない                                                              |
| `accounts[].label` / `color`                   | 含める                         | 紐づけ UI の表示用。復元先アカウントのラベルは上書きしない                                        |
| `accounts[].xUserId`                           | 含める（任意）                 | 自動候補用。公開情報（数値 ID）だが個人特定情報として扱う（§8）                                   |
| `accounts[].dataDirectory`                     | **除外**                       | 端末固有パス。流用するとパストラバーサル／他アカウントのデータ参照の危険（§8）                    |
| `accounts[].createdAt`                         | 除外                           | 復元先アカウントの属性                                                                            |
| Cookie／プロファイル                           | **除外（絶対）**               | 要件。形式仕様 `invNoCredentials`                                                                 |
| `columns` 全般                                 | 含める                         | `accountId` は紐づけ後に差し替え。`id` は復元時に再採番を推奨（重複防止・WebView ラベル衝突回避） |
| `columns[].pageType === "external"`            | 含める。`accountId` は不要     | アカウント非依存（`column.rs:54,162` の専用データディレクトリ）。**紐づけ対象外で常に復元可**     |
| `globalSettings`（端末非依存の項目）           | 含める                         | §3                                                                                                |
| `globalSettings.presets[].columns[].accountId` | 紐づけ表で同様に差し替え       | **見落としやすい**。プリセット内カラムも `accountId` を持つ（`types/index.ts:98-102`）            |

### ファイル形式・バージョン管理（推奨）

```json
{
  "format": "multi-column-x-backup",
  "schemaVersion": 1,
  "appVersion": "x.y.z",
  "exportedAt": "2026-10-08T00:00:00Z",
  "accounts": [{ "backupAccountId": "...", "label": "...", "color": "#...", "xUserId": "123" }],
  "columns": [ ... ],
  "globalSettings": { ... }
}
```

- 形式は JSON（既存の serde 資産・`settings.json` と同じ表現を再利用でき、人手で検査可能）。圧縮・暗号化は不要（秘密情報を含めない前提のため。§8 参照）。
- 読み込み時の扱い:
  - JSON として壊れている／`format` 不一致 → エラー表示のみ。**既存データには一切触れない**。
  - `schemaVersion` が現行より大きい（将来バージョン）→ 拒否し「アプリを更新してください」を表示（黙って欠落させない）。
  - `schemaVersion` が小さい → マイグレーション関数で段階的に上げる（初版は不要、枠だけ用意）。
  - 未知フィールドは無視、欠落は `serde(default)`／TS 既定値で補完。
- サイズ上限（例 5 MB）を読み込み前に検査（§8）。

---

## 2. アカウント紐づけの仕組み（P1-2）

### 設計

1. ファイル選択 → 検証 → 「バックアップ内アカウント一覧」を取得（形式仕様 `Idle → Mapping`）。
2. 紐づけ画面: バックアップ内アカウントごとに、復元先のログイン済みアカウント（`useAppStore.accounts`）をドロップダウンで選択。選択肢に「復元しない」を含む。各行に「そのアカウントに属するカラム数」を表示。
3. 同一の復元先アカウントを複数のバックアップ内アカウントに割り当てることの可否: 形式仕様は禁止していない（`assign` は b の二重割当のみ禁止）。**許可を推奨**（同一アカウントへの統合は正当なユースケース）。ただし確認用に警告表示。
4. 「復元」ボタンは紐づけが1件以上のときのみ有効（`restore` の `mapping.size > 0`）。
5. 復元実行: 紐づけ済みアカウントのカラムだけ `accountId` を差し替えて復元、`globalSettings` も反映（同時完了）。

### `xUserId` による自動初期候補 — 実現性と制約

- **[事実]** `Account.xUserId` は任意（`types/index.ts:16`、Rust `settings.rs:16-17` は `#[serde(default)]`）。
- **[事実・重大]** **新規アカウント追加フローでは `xUserId` を取得・保存していない。** desktop は `ACCOUNT_LOGIN_COMPLETE` を **payload 無し**（`listen<void>`、`useAccounts.ts:267`）で受け、`submitAccountName` は `xUserId` 無しで `addAccount`（`useAccounts.ts:182-198`）。`xUserId` が入るのは**再認証（reauth）完了時のみ**（`useAccounts.ts:357` の `updateAccount(account.id, { xUserId })`、取得元は `account.rs:247-263` の `twid` Cookie、Android は `AddAccount.kt:172-192` の `twidUserIdFromCookieString`）。
- → **[推測]** 実運用では再認証を一度も行っていないアカウントの `xUserId` は未設定が大半。Issue の Open Question 1 への回答: 「ほぼ埋まっていない可能性が高い。実データでの充足率は本調査では計測不能（ユーザー端末の `settings.json` が必要）」。
- 自動候補が成立する条件: バックアップ側・復元先側の**両方**で `xUserId` が設定済みで、かつ一致すること。片方でも未設定なら候補なし（手動選択）。
- 推奨対応:
  1. **前提整備（本機能の一部として実装）**: アカウント追加完了時にも `twid` から `xUserId` を取得して保存する（desktop は `account.rs` の追加フローのポーリング完了時に reauth と同じ `twid_user_id_from_cookies` を使い、イベント payload に載せる。Android は `AddAccount.kt` の完了センチネルに載せる）。
  2. **既存アカウントの後追い補完**: エクスポート時／起動時に、`xUserId` 未設定のアカウントについて Cookie から取得を試みる経路を検討（ただし desktop のカラム WebView の Cookie 読み取りと Android のプロファイル別 Cookie 取得の実装可否は **[要検証]**）。補完できない場合は「再認証すると自動候補が効く」旨を紐づけ画面に表示。
  3. 自動候補はあくまで**初期値**。ユーザーが変更可能にし、確定前に必ず確認させる（誤紐づけ防止）。
- `twid` は `u%3D<数値ID>` 形式（`twidUserIdFromCookieString`/`twid_user_id_from_cookies`）。取得ロジックは既存。

---

## 3. 端末依存の設定（P1-3）

判断基準: 「別の端末・別 OS に持って行って意味があるか／害が無いか」。

| 項目                                                                                            | 推奨                               | 理由                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `windowBounds`                                                                                  | 除外（復元先は現状維持）           | 画面解像度・マルチモニタ依存。`save_window_bounds`（`lib.rs:19`）が別経路で更新する                              |
| `defaultAccountId`                                                                              | 紐づけ表で変換。未紐づけなら未設定 | アカウント ID 参照                                                                                               |
| `pendingDataDirectoryDeletions`                                                                 | 除外                               | 端末固有パス（削除対象）。**含めると別端末で任意パス削除に使われる恐れ**                                         |
| `mobileSwipeArea*`、`mobileTwoColumnEnabled`                                                    | 含める（ただし PC では無効）       | Android 専用だが無害。PC→Android→PC で設定を失わないよう保持                                                     |
| `useXAppForCompose`                                                                             | 含める                             | 端末側に X アプリが無いと意味が変わるが値自体は無害                                                              |
| `theme`、`columnScale`、各 `default*`、`ngWords`、`repostHiddenUserIds`、`customCSS`、`presets` | 含める                             | 端末非依存                                                                                                       |
| カラムの `width`/`heightValue`/`gridRow`/`gridCol`                                              | 含める                             | ただし Android は 1 カラム表示等の差があり得る **[推測]**。復元時にグリッド整合（`gridLayout.ts`）を再正規化する |

> 運用: 新規 `GlobalSettings` フラグ追加時に「エクスポート対象か」を決めなければならなくなる。**ホワイトリスト方式**（除外項目のみ列挙するブラックリストは新項目の漏れで端末依存値が混入する）を採り、端末依存項目を型レベルで分離するテストを置く。

---

## 4. 紐づけ先が未指定のアカウント（P1-4）

| 選択肢                                | 長所                                                                                                                                                                                 | 短所                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| A. 該当カラムを復元しない（**推奨**） | 要件「指定された対応関係に従ってカラムを復元」と一致。形式仕様の `restoredCols` は mapping 済みの owner のカラムのみ。部分移行が可能（PC のアカウント3つのうち2つだけ Android へ等） | カラムが黙って消えるように見える → 復元前に「N 件のカラムは復元されません」と明示                       |
| B. 紐づけを必須にする                 | 取りこぼしが無い                                                                                                                                                                     | 持っていないアカウントがあると詰む。形式仕様は mapping 部分集合を許容（`mapping.size > 0`）しており矛盾 |
| C. 既定アカウントに自動割当           | 手間が少ない                                                                                                                                                                         | 意図しないアカウントでカラムが開く（プライバシー上の事故）                                              |

→ **A を推奨**。ただし `external` カラムは対象外（常に復元）。復元結果ダイアログでスキップ件数を表示。

---

## 5. 既存データとの関係（P1-5）

| 方式               | 長所                                                                                 | 短所                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全置換（**推奨**） | 結果が予測可能。カラム順序・グリッド座標・プリセット ID の衝突が起きない。実装が単純 | 既存カラムが消える                                                                                                                                      |
| マージ             | 既存を保持                                                                           | グリッド座標の衝突解決、`order` の再採番、プリセット／NG ワードの重複排除、設定の優先順位が必要。形式仕様の `invSettingsWithRestore` を満たす定義が複雑 |

→ **全置換**。ただし破壊的操作なので: (1) 確認ダイアログに「現在のカラム N 件が置き換わる」を明示、(2) **リストア直前に現在の `appSettings` を自動バックアップ**（§8）。アカウント自体（`accounts`）は**置換しない**（復元先でログイン済みの実アカウントが正）。置換対象は `columns` と `globalSettings`（端末依存項目を除く）のみ。

---

## 6. 全プラットフォームでのファイル入出力（P1-6）

### 現状 [事実]

- `tauri-plugin-dialog = "2"` は **desktop 限定の依存**（`Cargo.toml:65-67`、`cfg(not(any(android, ios)))`）。`lib.rs:179` で init。Rust 側から `app.dialog().file().save_file(callback)` を oneshot で await する実装が既存（`video_download.rs:175-190`）。
- Android には既存の SAF 実装が 2 つある: 保存＝`ActivityResultContracts.CreateDocument("*/*")`（`MainActivity.kt:72`、`saveDownloadedVideo` 経由）、選択＝`fileChooserLauncher`（`MainActivity.kt:95`、WebView の `<input type=file>` 用）。Rust→Kotlin は JNI ブリッジ（`android_bridge.rs`）。
- capability の dialog 許可: `default.json` に `dialog:*` は無い（Rust 側から使うため不要）。

### プラットフォーム別方式（推奨）

| OS                      | エクスポート                                                                                                                                                                          | インポート                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows / macOS / Linux | Rust コマンド内で `app.dialog().file().add_filter("バックアップ", &["json"]).set_file_name(...).save_file(cb)` → パスへ書き込み                                                       | 同 `pick_file(cb)` → 読み込み（サイズ上限検査）→ JSON 検証                                                                                   |
| Android                 | `MainActivity.kt` に `CreateDocument("application/json")` ランチャー追加。Rust が内容（JSON 文字列 or 一時ファイルパス）を JNI で渡し、`contentResolver.openOutputStream(uri)` へ書く | `OpenDocument` ランチャー追加。`contentResolver.openInputStream(uri)` で読み、文字列を Rust へ返す（`ContentResolver` 経由なので権限は不要） |

- 設計の肝: **ダイアログ/URI I/O はプラットフォーム層、JSON の検証・変換・適用は共通 Rust（または TS）層**に分け、`#[cfg(desktop)]` / `#[cfg(mobile)]` の差を「ファイル I/O の2関数」に閉じ込める。動画ダウンロードの構成（desktop は直接、Android は一時ファイル→SAF コピー）が前例。
- **[要検証]** SAF の ActivityResult は `registerForActivityResult` を Activity 生成前に登録する必要がある制約（`MainActivity.kt:70` のコメント）に従う。
- **ACL / ProGuard**: コマンド追加時は `build.rs` の `AppManifest` と `default.json`（メイン専用なので `column-webview.json` には追加しない。`require_main_caller` 必須）を同時更新。`MainActivity.kt` に公開メソッドを追加したら `proguard-rules.pro` の keep ルールも同期（CLAUDE.md の必須ルール）。
- **PC ↔ Android の移行**: 形式は共通 JSON なので問題なし。ファイルの受け渡し自体（クラウド経由等）はユーザー任せ。

---

## 7. 既存コードへの影響範囲（P2-7）

| 領域                                 | 影響                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src-tauri/src/commands/settings.rs` | エクスポート用の `AppSettingsData` → バックアップ DTO 変換（端末依存項目を落とす）、インポート検証・適用コマンドを追加。serde の `rename` 規約に従う                                                                                                                     |
| `settings_file.rs`                   | 適用は既存 `save_store_atomically` を使う（`Store::save` 直呼び禁止）。リストア前自動退避は既存 `backup_file_name`/`backup_broken_file` を流用可 **[推測: 要リファクタ]**                                                                                                |
| `useAppStore.ts`                     | `columns`/`globalSettings` 一括置換アクション追加（`replaceColumns`（84行目）に近い既存あり）。**保存は `saveSettings` 経由で、`settingsSaveBlocked` ガード（`settings-file-crash-safety-notes.md`）を尊重**                                                             |
| カラム WebView                       | 全置換後は既存 WebView を全て破棄→再生成が必要。プリセット読込の再生成処理（`preset-load-recreates-webviews.feature`）が流用可能                                                                                                                                         |
| Android                              | 復元後のカラム再構成 — Open Question 2: `View.GONE→INVISIBLE` 修正（`project_mobile_column_gone_invisible_fix`）や仮想リスト非再描画の知見から、**WebView を一旦 remove→create し、表示切替（`showColumnWebView`）を呼び直す手順が必要になる可能性が高い [要検証/実機]** |
| ACL                                  | 上記 §6。契約テスト `acl_contract.rs` が `build.rs`/capability の不一致を検出                                                                                                                                                                                            |
| 既定値契約テスト                     | 新規設定項目を足さないので影響小。バックアップ DTO の既定値補完テストを追加する程度                                                                                                                                                                                      |
| テスト                               | Rust 単体（DTO 変換・検証・バージョン判定）、TS 単体（紐づけロジック・`accountId` 差し替え・プリセット差し替え）、Storybook（紐づけ UI）、`@manual`（Android SAF、実機での WebView 再構成）                                                                              |

### Android Auto Backup との関係 [事実・注意]

`AndroidManifest.xml:33-35` で `allowBackup="true"` + `MultiColumnXBackupAgent`（`BackupFileSelector.selectFiles`）は **Cookie を含む WebView プロファイルを OS のバックアップ対象に含めている**。これは端末引き継ぎ用の別機能であり、本機能の「Cookie は含めない」要件とは独立。ただしユーザーに混同させないよう、UI 文言で「このバックアップにはログイン情報は含まれません。復元先で事前にログインしてください」と明記する。

---

## 8. リスクと注意点（P2-8）

| リスク                           | 対策                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **不正・悪意あるファイル**       | ① 読み込み前にサイズ上限。② `serde` で厳密デシリアライズ（`deny_unknown_fields` は将来互換を損なうので使わず、型検証のみ）。③ **`dataDirectory` 等のパスはファイルから一切受け取らない**（バックアップに含めず、復元時に新規生成された値のみ使う）。④ `customCSS`/`ngWords`/URL（`customUrl`、`external` カラムの URL）は既存の入力検証・CSP と同じ検証を通す。特に `external` カラムの `customUrl` は **スキーム検査（http/https のみ）** を必須にする（`popup-url-validation.feature` と同様）。⑤ 件数上限（カラム数・文字列長） |
| **部分失敗時のロールバック**     | 手順を「検証 → 変換（メモリ上）→ 現行設定を退避 → `save_store_atomically` で一括反映 → WebView 再生成」とする。ディスクへの反映は1回のアトミック書き込みのみ。WebView 再生成の失敗はデータ破壊を伴わないので、失敗時は退避ファイルからの復元手段を案内                                                                                                                                                                                                                                                                             |
| **リストア前の自動バックアップ** | 必須。既存の `settings.json.prev`（直前世代、`settings_file.rs`）は保存のたびに上書きされるため当てにならず、**専用のタイムスタンプ付き退避**を作る（保持世代数を制限）                                                                                                                                                                                                                                                                                                                                                            |
| **個人情報**                     | Cookie は含めないが、`label`（アカウント名）、`xUserId`、`searchQuery`、`listId`、`customUrl`、NG ワード等はユーザー固有情報。暗号化は不要と判断するが、エクスポート時に「共有する際は注意」を表示。`xUserId` を含めるかをオプション化する案もあるが、自動候補が効かなくなるため既定は含める                                                                                                                                                                                                                                       |
| **紐づけミス**                   | 自動候補は初期値のみ。確定前に「アカウント名→@ID」ではなく**ラベルと色**を併記して確認（`xUserId` から @ハンドルは引けない）                                                                                                                                                                                                                                                                                                                                                                                                       |
| **実行中の競合**                 | リストア中は自動保存・カラム自動更新を停止（`settingsSaveBlocked` と同種のロック）。他アカウントの追加/再認証と同時に走らせない                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 9. 他クライアント・一般アプリの事例（P3）

**未調査。** 本セッションでは Web 検索を行っていないため、他の TweetDeck 系クライアントの事例については記述しない。一般論（推測）としては、多くのデスクトップアプリは「設定のエクスポート → 単一の JSON/ZIP」と「インポート前の確認」という粒度で実装しており、本推奨案はそれに沿っているが、**出典付きの裏付けは別途必要**。

---

## 10. 形式仕様（Quint/Alloy）との整合

- フェーズ `Idle → Mapping → Restored`、`assign` の二重割当禁止 → §2 の UI（バックアップ内アカウントごとに1つの選択）と一致。
- `restore` の前提 `mapping.size > 0` → §4 の「紐づけゼロは復元不可」と一致。
- `restoredCols` は mapping 済み owner のカラムのみ、参照先は復元先アカウントに限る → §4 推奨 A と一致。**差異に注意**: 形式仕様のモデルには `external` カラム（アカウント非依存）とプリセット内カラムが存在しない。実装では前者は常時復元、後者は同じ紐づけ表で変換する拡張を入れるが、これは仕様の不変条件（`invRestoredUsesMapping`/`invTargetsValid`）を破らない（`external` は `accountId` 参照を持たない）。この拡張は Issue のモデルにシナリオとして追加して再承認を得ることを推奨。
- `invSettingsWithRestore`（設定復元は Restored と同時）→ §8 の「1回のアトミック書き込み」で自然に満たせる。
- `invNoCredentials` → §1 の「`dataDirectory`/Cookie を含めない」ホワイトリスト方式で型レベルに担保。

---

## 11. 推奨設計の概要

1. **エクスポート**: Rust コマンド `export_backup`（main 限定）— `AppSettingsData` から DTO（`schemaVersion: 1`、端末依存項目除外、`dataDirectory` 除外）を作り、プラットフォーム層でファイル保存。
2. **インポート（検証）**: `read_backup`（main 限定）— ファイル選択 → サイズ/JSON/`format`/`schemaVersion` 検査 → バックアップ内アカウント一覧を返す（まだ何も変更しない）。
3. **紐づけ UI**: React ダイアログ。自動候補は `xUserId` 一致のみ。確認画面で「復元されるカラム N / スキップ M」と全置換の警告。
4. **適用**: TS 側で `accountId` 差し替え（カラム・プリセット）と純関数でのグリッド正規化 → `applyBackup` コマンドで「現行設定の専用退避 → `save_store_atomically`」→ フロントのストア更新 → WebView 再生成。
5. **前提整備（独立 PR 推奨）**: アカウント追加時の `xUserId` 取得・保存（§2-1）。

### 残るリスク

- `xUserId` の充足率が低いと自動候補はほぼ効かない（§2。前提整備で新規分のみ改善、既存は再認証待ち）。
- Android の復元後 WebView 再構成手順は実機検証が必要。
- SAF/JNI まわりの ProGuard keep 同期の漏れ（リリースビルドでのみ顕在化）。
- Gherkin 承認前提のため、実装に進むなら `docs/specs/` へのシナリオ化と承認が必要（`@manual`: Android SAF 入出力、PC↔Android 移行、実 DOM での復元後表示）。

---

## 未実施事項

- 公式ドキュメント（Tauri v2 dialog/fs プラグイン、Android SAF）の URL 出典付け。コード側の根拠のみ提示。
- P3（他クライアント調査）。
- `xUserId` の実データ充足率の計測。

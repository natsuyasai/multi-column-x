# 設定・アカウント・カラムのバックアップ／リストア 設計調査レポート（Issue #206）

調査日: 2026-10-08 / 対象: `develop`（`1ac58dc` に一次レポート追加コミット `375a2dc` を載せた状態）。実装コードの変更は行っていない（差分はこのレポートのみ）。

凡例: **[事実]** コードまたは公式ドキュメントで確認した内容（場所または URL 付き）／ **[推測]** 事実から推論した内容・未検証／ **[要検証]** 実機・実データでしか確定できない内容。

この版は一次レポート（Issue #206 のコメント）を土台に、次を行った最終版である。

- コード参照を現行コードと照合して訂正した（§0.2）。
- 公式ドキュメントを実際に開いて出典を付けた（§6、§7）。
- P3（他クライアント・一般アプリの事例）を調査した（§9）。
- `xUserId` の書き込み経路を全て追跡した（§2）。
- Android のリストア後の WebView 再構成手順を実装から整理した（§7.2）。
- 一次レポートの誤りを 3 件訂正した（§0.2 の 5〜7）。

---

## 0. 結論サマリ

### 0.1 項目別の推奨

| #   | 項目               | 推奨（詳細は各節）                                                                                                                                                                                                                                                                |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | データ形式         | UTF-8 JSON 1 ファイル（`format` / `schemaVersion` / `appVersion` / `exportedAt` を持つエンベロープ）。`accounts` は `{backupAccountId, label, color, xUserId?}` のみで、Cookie・`dataDirectory` を含めない。将来バージョンと壊れたファイルは、既存データに触れずに拒否する（§1）  |
| 2   | アカウント紐づけ   | バックアップ内アカウント → 復元先アカウントの対応表で `accountId` を差し替える。`xUserId` 一致は初期候補にとどめる。**`xUserId` は再認証した場合にしか書き込まれない**ため、既存アカウントでは大半が未設定と見込まれる（実データでの充足率は計測不能）（§2）                      |
| 3   | 端末依存の設定     | `windowBounds`、`pendingDataDirectoryDeletions`、`dataDirectory`、`createdAt` を除外。`defaultAccountId` は紐づけ表で変換。ホワイトリスト方式で組み立てる（§3）                                                                                                                   |
| 4   | 紐づけ先が未指定   | **該当カラムを復元しない**（既定）。紐づけが 1 件も無いときは復元不可（モデルの `mapping.keys().size() > 0` と一致）。`external` カラムは例外で常に復元する（§4）                                                                                                                 |
| 5   | 既存データとの関係 | **全置換**（置換対象は `columns` と端末非依存の `globalSettings`。`accounts` は置換しない）。直前にタイムスタンプ付きの自動退避を作る（§5）                                                                                                                                       |
| 6   | ファイル入出力     | Windows / macOS / Linux は `tauri-plugin-dialog`（導入済み）で共通。Android は Kotlin 側の SAF（`CreateDocument` / `OpenDocument`）。保存は既存の一時ファイル → SAF コピー処理を流用できる。Tauri 公式 dialog プラグインは Android も対応と記載されており、代替案として残す（§6） |
| 7   | 既存コードへの影響 | 新規コマンドは main 専用（`build.rs` と `default.json` を同時更新）。適用はフロントエンドのストア経由で 1 回の保存にまとめる。Android は「旧 WebView を全て破棄 → 再生成」が必須（§7）                                                                                            |
| 8   | リスクと注意点     | 不正ファイル（URL スキーム・ID・サイズ・CSS）、リストア前の自動退避、保存の失敗検知、個人情報の注意表示（§8）                                                                                                                                                                     |
| 9   | 他クライアントの例 | VS Code（プロファイルのエクスポート／インポート、Settings Sync）と Windows Terminal（設定ファイル 1 つ）は、端末依存設定の除外・世代保持・全置換系の確認という点で本推奨案と整合する。TweetDeck 系クライアントのアカウント付け替え事例は、調査した範囲では見つからなかった（§9）  |

### 0.2 一次レポートからの訂正（コード参照のずれと事実誤り）

| #   | 一次レポートの記述                                                                       | 現行コードでの確認結果                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `save_window_bounds`（`lib.rs:19`）                                                      | 定義は `src-tauri/src/lib.rs:52`、呼び出しはメインウィンドウの `CloseRequested` 内の `lib.rs:185`                                                                                                                                                                                                              |
| 2   | `CreateDocument` は `MainActivity.kt:72`、`fileChooserLauncher` は `:95`                 | 現行は `MainActivity.kt:73`（`saveVideoLauncher`）と `:97`（`fileChooserLauncher`。起動は `:897`）                                                                                                                                                                                                             |
| 3   | `tauri-plugin-dialog` は `Cargo.toml:65-67`                                              | 現行は `src-tauri/Cargo.toml:63-67`（`[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]` の節。dialog は 67 行目）                                                                                                                                                               |
| 4   | `types/index.ts:105-109`（`AppSettings`）、`:98-102`（`ColumnPreset`）、`:16`（xUserId） | 現行は `AppSettings` が `src/types/index.ts:118-122`、`ColumnPreset` が `:112-116`、`Account.xUserId` が `:17`                                                                                                                                                                                                 |
| 5   | `external` カラムは `accountId` を持たず、アカウント非依存                               | **誤り（訂正）**。`external` カラムは `accountId` に**自分自身のカラム ID**を入れて作られる（`src/components/AddColumnDialog/AddColumnDialog.tsx:48`）。値は `accounts` に存在しない。データディレクトリはカラム ID で決まる（`src/services/externalColumn.ts:24-28`、`column.rs:165-174`）。§4・§5 に影響する |
| 6   | `customUrl` には既存の入力検証と同じ検証を通す                                           | **訂正**。カラム作成時の URL に**スキームの許可リストは見当たらなかった**（`column.rs:28-60` の `resolve_url` は `custom_url` をそのまま使い、`webview/mod.rs:20-22` の `parse_url` は文字列を URL にパースするだけ）。復元用の検証は新規に必要（§8）                                                          |
| 7   | モデルの `mapping.size > 0`、不変条件の列挙                                              | Issue #206 本文のモデルでは `mapping.keys().size() > 0`。不変条件には `invNoRestoreBeforeDone` もある。§10 で本文と再照合した                                                                                                                                                                                  |

### 0.3 Open Questions への回答

| 質問                                                              | 回答                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 既存アカウントの `xUserId` は実際にどの程度埋まっているか         | **回答できない（実データ未計測）**。理由: 計測にはユーザー端末の `settings.json` が必要で、この環境には無い。ただし書き込み経路は再認証の完了時に限られる（`useAccounts.ts` の 2 か所。`:357` は mobile、`:393-396` は desktop）。**再認証を行ったアカウントだけ**が対象で、新規追加では埋まらない（§2）。自動候補は、バックアップ側と復元先側の**両方が設定済みで一致**する場合だけ成立する |
| Android でカラム仮想リストを含む WebView を再構成する際の追加手順 | **新しい特別な手順は、コード上は見当たらない**。既存の「全カラム WebView の破棄 → 再生成」と同じ手順で足りる見込み。**同じ ID の WebView が残っていると再生成がスキップされる**ため、破棄を先に行うことが必須（§7.2）。実機の描画（仮想リストの再計算）は **[要検証]**                                                                                                                       |

---

## 1. バックアップのデータ形式（P1-1）

### 1.1 結果（現状）

- **[事実]** 永続化は `tauri-plugin-store` の `settings.json` の `appSettings` キー 1 つ。構造は `AppSettings { accounts, columns, globalSettings }`（TypeScript は `src/types/index.ts:118-122`、Rust は `AppSettingsData` の `src-tauri/src/commands/settings.rs:287`）。`store.set` を呼ぶキーは `appSettings` だけである（`settings.rs:521-533`、`lib.rs:72`）。
- **[事実]** 保存は `save_settings`（`settings.rs:521`）→ `save_store_atomically`（`settings_file.rs:81`）。読み込みは `load_settings`（`settings.rs:483`）。どちらも `require_main_caller`（`src-tauri/src/commands/mod.rs:23`）が付いている。
- **[事実]** Cookie などのログイン状態は `settings.json` に入っていない。アカウントごとの `dataDirectory`（WebView プロファイル）にある。**`AppSettings` を丸ごとエクスポートしても Cookie は入らない**が、`Account.dataDirectory` は端末固有パスなので含めない。
- **[事実]** `settings.json` に**スキーマバージョンは無い**（`schemaVersion` / `schema_version` は `src`・`src-tauri/src` に存在しない）。互換性は `#[serde(default)]` による欠落補完と、個別の移行関数（`settings.rs:299` の `migrate_area_remove_enabled`）で保っている。
- **[事実]** TypeScript の `GlobalSettings`（`src/types/index.ts:65-102`）と Rust の `GlobalSettingsData`（`settings.rs:218-283`）は、フィールドの集合が一致している（32 項目）。

### 1.2 含める／除外する項目

**アカウント（`Account`、`types/index.ts:11-18`）**

| 項目                       | 扱い                           | 理由                                                               |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `id`                       | `backupAccountId` として含める | カラムの参照キー。復元先では使わない                               |
| `label` / `color`          | 含める                         | 紐づけ UI の表示用。復元先アカウントの値は上書きしない             |
| `xUserId`                  | 含める（任意）                 | 自動初期候補に使う。数値 ID だが個人を特定する情報として扱う（§8） |
| `dataDirectory`            | **除外**                       | 端末固有パス。含めると別端末で任意パスを参照しうる（§8）           |
| `createdAt`                | 除外                           | 復元先アカウントの属性                                             |
| Cookie／WebView の保存領域 | **除外（絶対）**               | 合意済み要件。モデルの `invNoCredentials`                          |

**カラム（`Column`、`types/index.ts:44-63`）**

| 項目                                                                                            | 扱い                             | 理由                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                                            | **復元時に新しい UUID へ再採番** | 重複とパス区切り文字を含む値を防ぐ。外部カラムのデータ領域は `column-<id>` で決まるため（`column.rs:165-174`）、ファイル由来の ID をそのまま使わない               |
| `accountId`（`external` 以外）                                                                  | 紐づけ表で差し替え               | 端末ローカル ID。復元先アカウントの ID に置き換える                                                                                                                |
| `accountId`（`external`）                                                                       | 再採番後の自分の `id` を入れる   | 作成時と同じ規則（`AddColumnDialog.tsx:48`）。紐づけ対象外                                                                                                         |
| `pageType` / `customUrl` / `homeTabName` / `searchQuery` / `searchLiveTab` / `listId` / `label` | 含める                           | カラムの定義そのもの。`customUrl` は検証が必要（§8）。`listId` は元アカウントだけが見られる非公開リストの場合、別アカウントでは表示できない可能性がある **[推測]** |
| `width` / `order` / `gridRow` / `gridCol` / `heightMode` / `heightValue` / `heightUnit`         | 含める                           | レイアウト。Android は `order` 順に並べる（`useMobileColumns.ts:112-114`）。復元時に範囲検査と正規化を行う                                                         |
| `settings`（`ColumnSettings`、`types/index.ts:20-42`）                                          | 含める                           | 端末非依存。`desktopNotifyEnabled` は OS の通知許可が端末ごとに異なる **[推測]**。値は保持し、許可は復元先の状態に従う                                             |

**グローバル設定（`GlobalSettings`、`types/index.ts:65-102`）**: 全項目の分類は §3 の表を参照する。

### 1.3 ファイル形式とバージョン管理（推奨）

```json
{
  "format": "multi-column-x-backup",
  "schemaVersion": 1,
  "appVersion": "x.y.z",
  "exportedAt": "2026-10-08T00:00:00Z",
  "accounts": [
    {
      "backupAccountId": "...",
      "label": "...",
      "color": "#...",
      "xUserId": "123"
    }
  ],
  "columns": [],
  "globalSettings": {}
}
```

| 選択肢                         | 長所                                                                                        | 短所                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A. JSON 1 ファイル（**推奨**） | 既存の serde 定義を再利用できる。人が内容を確認できる。PC と Android で同じ形式を共有できる | 秘匿はされない（秘密情報を含めないので許容）                                               |
| B. ZIP（複数ファイル）         | 将来、画像などを同梱できる                                                                  | 今回の対象に添付物が無い。展開時の検証（パス、サイズ）が増える                             |
| C. `settings.json` のコピー    | 実装が最小                                                                                  | `dataDirectory`・`windowBounds` などの端末依存値が混入する。アカウント付け替えの余地が無い |

- ファイル拡張子は `.json` とし、ダイアログのフィルタは `json` にする **[提案]**。複合拡張子（`.mcxbackup.json`）にするとダイアログのフィルタ指定が難しくなる **[推測]**。
- 読み込み時の扱い:
  - JSON として壊れている、または `format` が一致しない → エラー表示のみ。**既存データには一切触れない**。
  - `schemaVersion` が現行より大きい（将来バージョン）→ 拒否し、「アプリを更新してください」を表示する。欠落させて読み進めない。
  - `schemaVersion` が小さい → 段階的な移行関数で上げる（初版は枠だけ用意する）。
  - 未知のフィールド → 無視する。欠落 → `serde(default)` と TypeScript の既定値（`contracts/default-settings.json` の契約テスト、`src/types/defaults.contract.test.ts`）で補う。`deny_unknown_fields` は将来互換を損なうので使わない。
- 読み込み前にサイズ上限を検査する（§8）。

---

## 2. アカウント紐づけの仕組み（P1-2）

### 2.1 設計（UI の流れ）

1. ファイルを選択し、検証して、バックアップ内のアカウント一覧を取得する（モデルの `Idle → Mapping`）。
2. 紐づけ画面で、バックアップ内アカウントごとに、復元先のログイン済みアカウント（`useAppStore.accounts`）をドロップダウンで選ぶ。選択肢に「復元しない」を含める。各行に、そのアカウントに属するカラム数と、ラベル・色を表示する。
3. 同じ復元先アカウントを複数のバックアップ内アカウントに割り当てることは、モデルが禁止していない（モデルは `mapping: BackupAccount -> lone TargetAccount` で、禁止されるのは同じバックアップ内アカウントの二重割り当てだけ）。**許可を推奨**し、確認用に警告を出す。
4. 「復元」ボタンは、紐づけが 1 件以上のときだけ有効にする（モデルの `restore` の前提 `mapping.keys().size() > 0`）。
5. 復元実行で、紐づけ済みアカウントのカラムだけ `accountId` を差し替えて復元し、`globalSettings` も反映する（§5、§7）。

プリセット（`globalSettings.presets[].columns[]`）も `Column` 全体を持ち、`accountId` を含む（`types/index.ts:112-116`）。同じ紐づけ表で差し替える。紐づけの無いアカウントのカラムは、プリセットからも取り除く（プリセット自体は残す）。

### 2.2 `xUserId` の書き込み経路（どの操作で埋まり、どの操作で埋まらないか）

| 操作                       | `xUserId`      | 根拠                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新規追加（desktop）        | **埋まらない** | ログイン検出は 500ms ごとの URL ポーリングで、イベントは**ペイロード無し**（`account.rs:50` の `emit(ACCOUNT_LOGIN_COMPLETE, ())`）。受け側は `listen<void>`（`useAccounts.ts:267`）。アカウントは `xUserId` 無しで作られる（`useAccounts.ts:182-198`）                             |
| 新規追加（Android）        | **埋まらない** | 完了はセンチネルファイルで通知され、Rust が返す JSON は `accountId` / `dataDirectory` / `windowLabel` のみ（`account.rs:91-95`）。`AddAccount.kt` の `finishWithResult` は Cookie を保存してセンチネルを書くだけ（`AddAccount.kt:147-160`）                                         |
| 再認証（desktop）          | **埋まる**     | `twid` Cookie から数値 ID を取り出して `ACCOUNT_REAUTH_COMPLETE` のペイロードに載せる（`account.rs:156`、`:247-270`）。フロントが `applyDesktopReauthResult` 内の `updateAccount(account.id, { xUserId, dataDirectory: newDataDirectory })` で保存する（`useAccounts.ts:393-396`）  |
| 再認証（Android）          | **埋まる**     | `AddAccount.kt:177-192` が `twidUserIdFromCookieString` で ID を得て `reauth_complete` センチネルに書き、Rust が JSON の `xUserId` として返す（`account.rs:340-359`）。フロントが `reauthOnMobile` 内の `updateAccount(account.id, { xUserId })` で保存する（`useAccounts.ts:357`） |
| 設定の読み込み             | 変わらない     | `xUserId` は `#[serde(default)]` の任意項目（`settings.rs:16-17`）。無い旧データは `None` になる（`settings.rs:853-865`）                                                                                                                                                           |
| アカウント編集（名前・色） | 変わらない     | `updateAccount` の更新対象型に `xUserId` は含まれるが（`useAppStore.ts:70-75`）、`xUserId` を渡す呼び出しは `useAccounts.ts` の 2 か所だけ（`:357` は mobile の再認証、`:393-396` は desktop の再認証。`src` 全体の検索結果、テストを除く）                                         |

- **[事実]** `xUserId` の項目と再認証の機能は 2026-07-05〜07-06 に追加された（コミット `27750e4`、`5ac89a7`、`2c6fcd7`、`git log -S` の結果）。それ以前に追加したアカウント、およびそれ以降に追加して再認証していないアカウントは未設定である。
- **[推測]** 実運用では、再認証を一度も行っていないアカウントの `xUserId` は未設定が大半。実データの充足率は計測不能（§0.3）。

### 2.3 自動初期候補の成立条件と制約

| 条件                                                         | 結果                                         |
| ------------------------------------------------------------ | -------------------------------------------- |
| バックアップ側・復元先側の**両方**が設定済みで、文字列が一致 | 初期候補にする                               |
| どちらか一方でも未設定                                       | 候補なし。ラベルと色を併記して手動選択にする |
| 復元先に同じ `xUserId` のアカウントが複数ある                | 自動選択しない（手動選択）                   |

推奨対応:

1. **前提整備（独立した変更として推奨）**: アカウント追加の完了時にも `twid` から `xUserId` を取得して保存する。desktop は `account.rs` のポーリング完了時に、再認証と同じ `twid_user_id_from_cookies`（`account.rs:156`）を使ってペイロードに載せる。Android は `AddAccount.kt` の完了センチネルに載せる。
2. **既存アカウントの後追い補完**: エクスポート時または起動時に、未設定のアカウントの Cookie から取得する案がある。desktop は再認証が WebView の `cookies_for_url` を使っている（`account.rs:249`）ため、同様の読み取りが既存のカラム WebView でも可能か、Android はプロファイル別の Cookie 取得が可能かは **[要検証]**。補完できない場合は「再認証すると自動候補が効く」旨を紐づけ画面に表示する。
3. 自動候補はあくまで初期値。ユーザーが変更でき、確定前に必ず確認させる（誤紐づけの防止）。

---

## 3. 端末依存の設定（P1-3）

判断基準: 「別の端末・別の OS に持って行って意味があるか、害が無いか」。TypeScript と Rust のフィールド集合が一致することを確認したうえで、`GlobalSettings` の全項目を分類した。

| 項目（`types/index.ts:65-102`）                                                                                                                                                                                                     | 扱い                                                     | 理由                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `windowBounds`                                                                                                                                                                                                                      | **除外**（復元先の値を維持）                             | 画面解像度・マルチモニタに依存する。デスクトップのメインウィンドウを閉じるときに別経路で更新される（`lib.rs:52`、`:185`） |
| `pendingDataDirectoryDeletions`                                                                                                                                                                                                     | **除外**                                                 | 端末固有パスの削除予定リスト。含めると別端末で任意のパスを削除対象にされうる                                              |
| `defaultAccountId`                                                                                                                                                                                                                  | **変換**（紐づけ表で差し替え。未紐づけなら未設定）       | アカウント ID 参照                                                                                                        |
| `presets`                                                                                                                                                                                                                           | **変換**（カラムの `accountId` を差し替え、ID を再採番） | §2.1                                                                                                                      |
| `mobileSwipeAreaEnabled` / `mobileSwipeAreaHeight` / `mobileSwipeAreaOpacity` / `mobileTwoColumnEnabled`                                                                                                                            | 含める（PC では効果が無い）                              | Android 専用だが無害。PC → Android → PC の移行で値を失わないよう保持する                                                  |
| `useXAppForCompose`                                                                                                                                                                                                                 | 含める                                                   | 復元先の端末に X アプリが無いと意味が変わるが、値自体は無害                                                               |
| `theme` / `columnScale` / `customCSS` / `defaultColumnCustomCSS`                                                                                                                                                                    | 含める（CSS は §8 の注意付き）                           | 端末非依存                                                                                                                |
| `defaultAutoReloadEnabled` / `defaultAutoReloadInterval` / `defaultShowCountdown` / `defaultHideHeaderEnabled` / `defaultHideTweetInputEnabled` / `defaultShowCustomMenu` / `defaultScrollPosRestoreEnabled`                        | 含める                                                   | 新規カラムの既定値。端末非依存                                                                                            |
| `popupEscCloseEnabled` / `videoAutoPlayStopEnabled` / `imagePopupEnabled` / `videoPopupEnabled` / `smallImageEnabled` / `smallImageWidth` / `blurImageEnabled` / `blurImageAmount` / `hideAdEnabled` / `apiRateLimitMonitorEnabled` | 含める                                                   | 表示・動作の好み。端末非依存                                                                                              |
| `ngWords` / `repostHiddenUserIds`                                                                                                                                                                                                   | 含める                                                   | 利用者固有だが端末非依存。個人情報の注意表示の対象（§8）                                                                  |

**運用上の判断（ホワイトリスト方式）**: 新しい `GlobalSettings` のフラグを足すたびに「エクスポート対象か」を決める必要が生じる。除外項目だけを列挙する方式（ブラックリスト）では、新項目の漏れで端末依存の値が混入する。**含める項目を列挙するホワイトリスト方式**を採り、`GlobalSettings` の全項目が「含める／除外／変換」のどれかに分類されていることを確認するテストを置く（`contracts/default-settings.json` の契約テストと同じ考え方）。

---

## 4. 紐づけ先が未指定のアカウント（P1-4）

| 選択肢                                | 長所                                                                                                                                                                                        | 短所                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A. 該当カラムを復元しない（**推奨**） | 要件「指定された対応関係に従ってカラムを復元」と一致。モデルの `restoredCols` は、紐づけ済みアカウントのカラムだけ（Quint の `filter`、Alloy の `c.owner.(Sys.mapping)`）。部分移行ができる | カラムが黙って消えるように見える → 復元前に「N 件のカラムは復元されません」と表示して対処する                                        |
| B. 紐づけを必須にする                 | 取りこぼしが無い                                                                                                                                                                            | 復元先に無いアカウントがあると復元できない。モデルは紐づけが 1 件以上あればよく（`mapping.keys().size() > 0`）、全件必須とは矛盾する |
| C. 既定アカウントに自動で割り当てる   | 手間が少ない                                                                                                                                                                                | 意図しないアカウントでカラムが開く（プライバシー上の事故）。モデルの `invRestoredUsesMapping`（指定した紐づけ先のみ参照）にも反する  |

→ **A を推奨**。

- **`external` カラムは例外**: アカウントに属さないため（§0.2 の 5）、紐づけ表の対象外にして**常に復元する**。これはモデル外の拡張である（§10）。
- 全置換と組み合わせると、紐づけの無いアカウントのカラムは**今回の復元では失われ、復元後に差分だけを追加で取り込むことはできない**（再度インポートすると、また全置換になる）。そのため、確認画面にスキップされるカラムの一覧を出し、バックアップファイルは利用者の手元に残ることを案内する。段階的な取り込みが必要な場合は、将来の拡張としてマージ方式を検討する（§5）。

---

## 5. 既存データとの関係（P1-5）

| 方式               | 長所                                                                                                                                                  | 短所                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全置換（**推奨**） | 結果が予測可能。カラムの順序・グリッド座標・プリセット ID の衝突が起きない。実装が単純。モデルの「復元されるカラム = 紐づけ済みの分」と素直に対応する | 既存のカラムが消える                                                                                                                                          |
| マージ             | 既存を保持できる                                                                                                                                      | グリッド座標の衝突解決、`order` の再採番、プリセット・NG ワードの重複排除、設定の優先順位が必要。モデルは全置換かマージかを固定していないが、定義が複雑になる |

→ **全置換**。破壊的な操作なので次を必須にする。

1. 確認ダイアログに「現在のカラム N 件が置き換わる」を明示する。
2. **リストア直前に現在の `settings.json` をタイムスタンプ付きで自動退避する**（§8）。
3. **置換する範囲**は `columns` と、端末非依存の `globalSettings`。`accounts` は**置換しない**（復元先でログイン済みの実アカウントが正）。`windowBounds` と `pendingDataDirectoryDeletions` は現在の値を維持する。
4. 置換される `external` カラムのデータ領域は、**復元が成功した後に**削除する（`delete_external_column_data`、`column.rs:200`）。再採番した新しい ID の `external` カラムは、ログイン状態を持たない空のプロファイルで始まる（バックアップに Cookie を含めないため）。
5. 全置換で消えるカラムの WebView は、先に全て破棄する（§7.2）。

---

## 6. 全プラットフォームでのファイル入出力（P1-6）

### 6.1 現状 [事実]

- `tauri-plugin-dialog = "2"` は **desktop 限定の依存**（`src-tauri/Cargo.toml:63-67`。コメントに「Android は Kotlin 側 SAF で別実装する」とある）。プラグインの登録も `#[cfg(desktop)]`（`src-tauri/src/lib.rs:173-179`）。`Cargo.lock` の解決は `tauri-plugin-dialog 2.7.2`、`rfd 0.16.0`（`Cargo.lock:4602-4609`、`:3613-3614`）。
- Rust 側で `app.dialog().file()....save_file(callback)` を `oneshot` で待つ実装が既にある（`src-tauri/src/commands/video_download.rs:175-193` の `pick_save_path`）。
- Android には SAF の実装が 2 つある。
  - 保存: `ActivityResultContracts.CreateDocument("*/*")`（`MainActivity.kt:73`）。Rust がダウンロード済みの一時ファイルを用意し、`saveDownloadedVideo`（`MainActivity.kt:279`）が SAF の保存先へコピーして一時ファイルを削除する。Rust からは JNI（`android_bridge.rs:692` の `save_downloaded_video`）で呼ぶ。**保存の成否やキャンセルを Rust へ返す経路は無い**（`MainActivity.kt:73-91`）。
  - 選択: WebView の `<input type="file">` 用の `fileChooserLauncher`（`MainActivity.kt:97`）。カラム WebView 専用で、アプリ自身の読み込みには使えない。
- `default.json` に `dialog:*` の許可は無い（`src-tauri/capabilities/default.json`。Rust 側から使うため不要）。
- Android 側のメソッドを Rust から呼ぶ JNI は、`MainActivity` のメソッド名を文字列で指定するため、ProGuard の keep ルールが必要（`src-tauri/gen/android/app/proguard-rules.pro:34-58`）。Kotlin から Rust への通知は `AppBridge` の `external fun`（`AppBridge.kt`、`android_bridge.rs` の `Java_com_natsuyasai_multicolumnx_AppBridge_*`）で行う。

### 6.2 公式ドキュメントで確認した内容

| 出典                                                                                                                                                                | 確認した内容                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri v2 dialog プラグイン <https://v2.tauri.app/plugin/dialog/>                                                                                                    | 対応プラットフォームは Windows / Linux / macOS / Android / iOS。Android と iOS は「フォルダ選択に未対応」。Rust は `pick_file` / `blocking_save_file`、`add_filter` を持つ。「ファイルダイアログ API は Linux・Windows・macOS ではパスを返し、iOS では `file://` URI、Android では content URI を返す」「ファイルシステムプラグインは任意のパス形式をそのまま扱える」 |
| Tauri v2 dialog の JavaScript リファレンス <https://v2.tauri.app/reference/javascript/dialog/>                                                                      | `save()` は `Promise<string \| null>` を返し、キャンセルで `null`。`fileAccessMode` は `copy`（選択したファイルをアプリのサンドボックスへコピー）と `scoped`（元の場所に置いたまま）。`defaultPath` が無い場合、Android は `(invalid).txt` を既定のファイル名にする                                                                                                   |
| Tauri v2 fs プラグイン <https://v2.tauri.app/plugin/file-system/>                                                                                                   | 対応は Windows / Linux / macOS / Android / iOS。モバイルではアプリのフォルダに制限される。権限だけではスコープは付与されず、スコープに無いパスは実行時に `forbidden path` で失敗する。**ダイアログで選んだファイルが自動でスコープに入るという記載は、確認したページには無かった**                                                                                    |
| rfd（Tauri dialog の内部ライブラリ） <https://docs.rs/rfd/latest/rfd/>                                                                                              | Windows / macOS / Linux・BSD に対応（Linux は GTK3 または XDG Desktop Portal）。macOS の非同期ダイアログは `NSApplication` のインスタンスが必要。**Android の記載は無い**                                                                                                                                                                                             |
| Android `ActivityResultContracts.CreateDocument` <https://developer.android.com/reference/androidx/activity/result/contract/ActivityResultContracts.CreateDocument> | 入力は提案ファイル名（`String`）、出力は作成された文書の `Uri`、キャンセルで `null`。コンストラクタは MIME タイプを取る。SAF を使うため、広い読み書き権限は不要                                                                                                                                                                                                       |
| Android `ActivityResultContracts.OpenDocument` <https://developer.android.com/reference/androidx/activity/result/contract/ActivityResultContracts.OpenDocument>     | 入力は MIME タイプの配列、出力は選択された文書の `Uri`、キャンセルで `null`。マニフェスト権限は不要。永続化したい場合は `takePersistableUriPermission` を使う                                                                                                                                                                                                         |
| Android 公式ガイド（共有ストレージの文書）<https://developer.android.com/training/data-storage/shared/documents-files>                                              | `ACTION_OPEN_DOCUMENT` で文書を開き、`ACTION_CREATE_DOCUMENT` で保存先を選ぶ。読み取りは `contentResolver.openInputStream(uri)` または `openFileDescriptor(uri, "r")`、書き込みの例は `openFileDescriptor(uri, "w")`。「この仕組みはシステム権限を必要としない」。`takePersistableUriPermission` で再起動をまたいだアクセスを保てる                                   |
| Android SAF の概要 <https://developer.android.com/guide/topics/providers/document-provider>                                                                         | クライアントアプリは `ACTION_OPEN_DOCUMENT` / `ACTION_CREATE_DOCUMENT` で起動する。ストレージ権限は不要                                                                                                                                                                                                                                                               |

- **確認できなかった点**: `ContentResolver` のクラスリファレンス（<https://developer.android.com/reference/android/content/ContentResolver>）は、本文が取得できず、`openInputStream` / `openOutputStream` の個別の説明を直接は確認できなかった。代わりに、公式ガイド（`openInputStream`、`openFileDescriptor` の使用例）と、既存実装の `contentResolver.openOutputStream(uri)`（`MainActivity.kt` の `saveVideoLauncher` 内）で裏付けた。
- **確認できなかった点**: macOS の App Sandbox や Linux の XDG Desktop Portal に固有の追加手順は、Tauri の dialog / fs の公式ページには**記載が無かった**（記載が無いことは、問題が無いことの証明ではない）。

### 6.3 プラットフォーム別の方式（推奨）

| OS      | エクスポート                                                                                                                                                                                                                    | インポート                                                                                                                                                                                                                                                                                                                                  | 根拠                                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows | Rust コマンド内で `app.dialog().file().add_filter("バックアップ", &["json"]).set_file_name(..).save_file(cb)` → 返ったパスへ書き込む。`oneshot` で待つ構成は `video_download.rs:175-193` と同じ                                 | 同 `pick_file(cb)` → パスから読み込む（サイズ上限を先に検査）→ JSON を検証する                                                                                                                                                                                                                                                              | `tauri-plugin-dialog` は Windows に対応（公式）。同じ API が動画保存で既に使われている                                                                                                                                                                      |
| macOS   | Windows と同じコード                                                                                                                                                                                                            | Windows と同じコード                                                                                                                                                                                                                                                                                                                        | 公式は macOS に対応。内部の rfd は、非同期ダイアログに `NSApplication` のインスタンスを要すると記載している。**このアプリでの macOS 実機の動作は未確認（要検証）**                                                                                          |
| Linux   | Windows と同じコード                                                                                                                                                                                                            | Windows と同じコード                                                                                                                                                                                                                                                                                                                        | 公式は Linux に対応。rfd は GTK3 または XDG Desktop Portal。**この依存関係の解決結果（`cargo tree -i rfd -e features`）では `tauri-plugin-dialog` の `gtk3` 機能が有効**で、GTK3 バックエンドが使われる見込み **[推測]**。Linux 実機での動作は **[要検証]** |
| Android | **一時ファイル → SAF コピー**: Rust が JSON を一時ファイルへ書き、`saveDownloadedVideo` と同じ `CreateDocument("*/*")` で保存先へコピーする（既存実装を流用できる。ただし保存の成否を返す経路が無いため、完了通知の追加が必要） | **新規**: `MainActivity` に `OpenDocument` のランチャーを追加（`registerForActivityResult` はプロパティ初期化子で登録する制約がある。`MainActivity.kt:70` のコメント）。Kotlin が選択された文書を上限付きで読み、アプリの一時領域へコピーして、そのパスを `AppBridge` の `external fun` で Rust へ渡す。JSON の検証は Rust の共通処理で行う | 公式: `CreateDocument` / `OpenDocument` は SAF で、広い権限は不要。読み取りは `ContentResolver` を使う。既存実装は動画保存で同じ構成を採用している                                                                                                          |

**Android の代替案（Tauri 公式プラグインの利用）**: 公式ドキュメントでは dialog プラグインが Android に対応し、Android では content URI を返すとある。`tauri-plugin-dialog` を desktop 限定の依存から外し、`tauri-plugin-fs` を併用すれば、Kotlin のコードを減らせる可能性がある。ただし次の点は確認できていない。

- `save()` が返す content URI へ、fs プラグインで書き込めるか（公式ページに、ダイアログで選んだファイルが自動でスコープに入るという記載は無かった）。
- このリポジトリでは dialog プラグインを desktop 限定にしている（`Cargo.toml:66` のコメント、`lib.rs:173-179`）。変更すると capability と依存の見直しが必要になる。
- いずれも **[要検証/実機]**。

→ **推奨は Kotlin の SAF（上表）**。理由: 保存側は既存の実装を流用でき、このリポジトリで動いている構成と揃う。Tauri 公式プラグインの利用は、Android 実機での確認を前提にした代替案として残す。

### 6.4 desktop / mobile の条件コンパイルとの整合

- ファイル入出力を 2 つの関数に閉じ込める。デスクトップは `#[cfg(desktop)]` の関数（`video_download.rs` が `:7`、`:35`、`:55`、`:67`、`:159`、`:175`、`:198` で `#[cfg(desktop)]` を使っている）、Android は `android_bridge` を介した関数（`video_download.rs:410` の `handle_android_video_download_request` が前例）にする。
- JSON の検証・変換・適用は、プラットフォームに依存しない共通の層に置く。
- **PC ↔ Android の移行**: 形式は共通の JSON なので問題無い。ファイルの受け渡し（クラウドストレージなど）は利用者に任せる。移行先で値が効かない設定（Android 専用のスワイプ設定など）は無害なので保持する（§3）。

---

## 7. 既存コードへの影響範囲（P2-7）

### 7.1 影響範囲の一覧

| 領域                                     | 影響                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src-tauri/src/commands/settings.rs`     | バックアップ用の DTO への変換（端末依存項目を落とす）、インポートの検証を追加する。serde の `rename` の規約に従う（JS 側は camelCase）                                                                                                                                                                                                                                                                                                                       |
| `settings_file.rs`                       | 設定ファイルの書き込みは既存の `save_store_atomically`（`settings_file.rs:81`）を使い、`Store::save` を直接呼ばない。書き込みは `SAVE_LOCK`（`:78`）で直列化されている。リストア前の退避には、タイムスタンプ付きの名前を作る `backup_file_name`（`settings.rs:406`）を流用できる **[推測: 退避用の関数の切り出しが必要]**                                                                                                                                    |
| `src/store/useAppStore.ts`               | **フロントエンドのストアが設定の正**。`saveSettings`（`:161`）はメモリ上の状態全体を保存する。Rust 側だけで `settings.json` を書き換えると、次回の保存で古いメモリ状態に上書きされる。したがって、**ストアの状態を 1 回の `set` で置き換え、1 回保存する新しいアクション**が必要（既存の `replaceColumns`（`:250`）は個別の保存を起こす）。`loadSettings`（`:130-159`）が行う `migrateColumn`・既定値のマージ・`order` 順の並べ替えも適用する                |
| 保存の失敗の検知                         | `saveSettings` は失敗を `logError` で握りつぶす（`useAppStore.ts:169`）。リストアの成否を利用者に示すため、保存の呼び出しはエラーを伝える形にする                                                                                                                                                                                                                                                                                                            |
| `settingsSaveBlocked`                    | 読み込みに失敗した状態では保存が止まる（`useAppStore.ts:155`、`:165`）。この状態でリストアしても**保存されずに成功したように見える**ため、リストアを拒否するか、明示的に解除する                                                                                                                                                                                                                                                                             |
| カラム WebView                           | 全置換のあと、既存の WebView を全て破棄し、再生成する。既存の `removeWebviewsOf` / `rebuildWebviews` / `recreateAllWebviews`（`src/hooks/useColumns.ts:343-369`）と、プリセット読み込みの `loadPresetAndRecreateWebviews`（`:374-385`）が流用できる                                                                                                                                                                                                          |
| ACL                                      | 新しい `#[tauri::command]` を `build.rs` の `AppManifest::commands`（`src-tauri/build.rs:3`）、`capabilities/default.json` の `allow-<コマンド名>`、`contracts/ipc-constants.json`、`src/constants/ipc.ts` の `IPC_COMMANDS`、`ipc_constants.rs` に同時に追加する。メイン専用なので `require_main_caller`（`commands/mod.rs:23`）を呼び、`column-webview.json` には**追加しない**。`acl_contract.rs`（`:118`、`:137`、`:166`）の契約テストが不一致を検出する |
| 設定の既定値の契約テスト                 | 新しい設定項目を足さないので影響は小さい。バックアップ DTO の既定値補完のテストと、`GlobalSettings` の全項目が分類されていることのテスト（§3）を追加する                                                                                                                                                                                                                                                                                                     |
| Android の `MainActivity.kt` と ProGuard | `OpenDocument` を呼ぶ公開メソッドを追加したら、`proguard-rules.pro` の `-keepclassmembers`（`:34-58`）に同じシグネチャを同時に追加する（`docs/development/android-notes.md` のルール）。リリースビルドでしか症状が出ない                                                                                                                                                                                                                                     |
| テスト                                   | Rust の単体（変換・検証・バージョン判定）、TypeScript の単体（紐づけ・`accountId` の差し替え・プリセット・ID の再採番）、Storybook（紐づけ UI）、手動（Android の SAF、PC ↔ Android の移行、復元後の実機表示）                                                                                                                                                                                                                                               |

### 7.2 Android でのリストア後の WebView 再構成手順（Open Question 2）

既存の実装から整理した手順と根拠は次のとおり。

| 手順 | 内容                                                                                                                                                  | 根拠                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 旧カラムの WebView を**全て破棄**する（`removeColumnWebview`）                                                                                        | Kotlin の `createColumnWebView` は、同じ ID の WebView が既にあると**再作成も再読み込みもせずにスキップ**する（`MainActivity.kt:499-504`）。破棄しないと、古い内容が残る。`removeColumnWebView` は `destroy()` する（`:572-580`） |
| 2    | ストアを 1 回で置き換え、1 回保存する                                                                                                                 | §7.1                                                                                                                                                                                                                              |
| 3    | `restoreMobileColumns` で全カラムを並列に再生成する。表示するペア（1〜2 枚）は表示、それ以外は `View.INVISIBLE` で作る                                | `useMobileColumns.ts:107-170`。初期表示を `INVISIBLE` にするのは、`GONE` だとレイアウト対象外になり、X の仮想リストが正しいビューポートサイズを受け取れないため（`ColumnWebViewUtils.kt` のコメント）                             |
| 4    | アクティブなカラムの ID は `localStorage`（`STORAGE_KEYS.ACTIVE_COLUMN_ID`、`src/constants/ipc.ts:208`）から復元する。見つからなければ `order` の先頭 | `useMobileColumns.ts:116-123`。カラム ID を再採番するため、古い ID は一致せず、先頭のカラムが選ばれる                                                                                                                             |
| 5    | 表示前に、アクティブなカラムのアカウントの Cookie を切り替える（`setColumnCookies`）                                                                  | `useMobileColumns.ts:151-154`（起動時）。切替時は同ファイルの `setActiveColumn`（`:57-`）。紐づけで差し替えた `accountId`（復元先のアカウント）が使われる                                                                         |
| 6    | 表示ペアを `resize` する。アクティブなカラムを最後に送る                                                                                              | `useMobileColumns.ts:155-167`（`activeColumnWebViewId` が最後の `showColumnWebView` で決まるため、`MainActivity.kt:584-`）                                                                                                        |
| 7    | データディレクトリは復元先のアカウントから引く。解決できないカラムはスキップされる                                                                    | `src/services/externalColumn.ts:20-30`、`useMobileColumns.ts:133-137` の `dataDirectory === undefined` の分岐                                                                                                                     |

- **[事実]** これは起動時の復元と、プリセット読み込み後の再構成（`useColumns.ts:343-385`）が既に通っている経路で、新しい操作は不要。
- **[事実]** ダイアログを開いている間にカラムを作ると、ネイティブ WebView が前面に残る問題への対処が `rebuildWebviews` に入っている（`useColumns.ts:355-362`）。リストアの確認画面はダイアログなので、この処理がそのまま使われる。
- **[要検証/実機]** 次の点は実機でないと確定できない。
  - 全カラムを一度に作り直したあとの、仮想リストの描画（過去に `GONE` で起きた問題の再発が無いか）。
  - Profile API に対応していない端末での、Cookie の共有（`docs/development/android-notes.md` の「Cookie 共有まわり」）。
  - プリセット読み込みの Gherkin（`docs/specs/preset-load-recreates-webviews.feature`）は `@desktop` で、モバイルでの確認は仕様に無い。

### 7.3 Android の Auto Backup との関係 [事実・注意]

`AndroidManifest.xml:33-35` は `allowBackup="true"`、`fullBackupOnly="true"`、`backupAgent=".MultiColumnXBackupAgent"` を設定している。`BackupFileSelector.selectFiles` はキャッシュ系のディレクトリだけを除外し（`BackupFileSelector.kt`）、**Cookie を含む WebView のプロファイルを OS のバックアップ対象に含めている**。これは端末引き継ぎ用の別機能で、本機能の「Cookie は含めない」要件とは独立している。利用者が混同しないよう、UI の文言で「このバックアップにはログイン情報は含まれません。復元先で事前にログインしてください」と明記する。

---

## 8. リスクと注意点（P2-8）

| リスク                           | 対策                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **不正・悪意のあるファイル**     | ① 読み込み前にサイズの上限（例: 5 MB）を検査する。② `serde` の型付きデシリアライズで検証する。③ **`dataDirectory` などのパスはファイルから受け取らない**。④ **カラム ID は再採番する**（`column.rs:155` の `is_safe_column_id` は、区切り文字・`..` を含む ID を拒否するための関数）。⑤ **`customUrl` は `http` / `https` だけを許可する**（現状のカラム作成には許可リストが無い。§0.2 の 6）。⑥ 件数と文字列長の上限を設ける。⑦ 数値（幅・座標・間隔）は範囲を検査する |
| **カスタム CSS**                 | `globalSettings.customCSS`、`defaultColumnCustomCSS`、カラムの `settings.customCSS` は X のページに注入される（`src-tauri/src/inject/_src/custom_css.ts`、`column.rs:136`）。第三者が作ったバックアップに外部への通信を起こす CSS が含まれる可能性がある **[推測]**。確認画面に「カスタム CSS を含みます」と表示する                                                                                                                                                    |
| **部分失敗時のロールバック**     | 手順を「検証 → メモリ上で変換 → 現行設定を退避 → 1 回の保存 → WebView の再生成」とする。ディスクへの反映は、アトミック書き込み（一時ファイルへ書いてから置換する `atomic_write_with`、`settings_file.rs:29`）1 回だけにする。WebView の再生成が失敗してもデータは壊れないので、失敗時は退避ファイルからの復元手順を案内する。置き換えられる `external` カラムのデータ領域は、成功の確認後に削除する（§5）                                                               |
| **リストア前の自動バックアップ** | **必須**。既存の `settings.json.prev`（`PREV_FILE`、`settings_file.rs:7`）は、保存のたびに直前の状態で上書きされる（`write_settings_atomically`、`:67-75`）ため、**当てにならない**。タイムスタンプ付きの専用退避を作り、保持する世代数を制限する（例: 5 世代）**[提案]**                                                                                                                                                                                               |
| **保存の失敗の見落とし**         | `saveSettings` は失敗を握りつぶし（`useAppStore.ts:169`）、`settingsSaveBlocked` の間は保存しない（`:165`）。リストアは保存の成否を確認し、失敗なら成功と表示しない（§7.1）                                                                                                                                                                                                                                                                                             |
| **個人情報**                     | Cookie は含めないが、`label`（アカウント名）、`xUserId`、`searchQuery`、`listId`、`customUrl`、NG ワードなどは利用者固有の情報。暗号化は不要と判断するが、エクスポート時に「共有する際は注意」を表示する。`xUserId` を含めるかをオプションにする案もあるが、自動候補が効かなくなるため既定は含める                                                                                                                                                                      |
| **紐づけミス**                   | 自動候補は初期値だけにする。確定前に、ラベルと色を併記して確認する（`xUserId` から表示名は引けない）                                                                                                                                                                                                                                                                                                                                                                    |
| **実行中の競合**                 | リストア中は自動更新とカラムの保存を止める。他のアカウントの追加・再認証と同時に実行させない（`settingsSaveBlocked` と同種のロックを検討する）                                                                                                                                                                                                                                                                                                                          |

---

## 9. 他クライアント・一般アプリの事例（P3）

調査方法: 公式ドキュメントのページを開いて確認した。開けなかったページは、その旨を明記する。

### 9.1 事例

| 対象                                                | UI                                                                                                                                                           | ファイル形式／保存先                                                                                                                                                      | 粒度                                                                                                                                                                                                | 出典                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visual Studio Code のプロファイル                   | プロファイルのエディターで「Export...」。保存先は GitHub Gist か、ローカルファイル。インポートは「Import Profile...」で Gist の URL かファイルパスを指定する | ローカルファイルは拡張子 `.code-profile`。Gist は秘密（secret）扱いで、共有用のリンクを発行する                                                                           | 設定・キーボードショートカット・スニペット・タスク・拡張機能・MCP サーバー・UI の状態。**「エクスポート時、別のマシンには適用できないマシン固有の設定は含まれない（ローカルパスを指す設定など）」** | <https://code.visualstudio.com/docs/configure/profiles>                                                                                                                  |
| Visual Studio Code の Settings Sync                 | アカウントにサインインして同期。競合時は「ローカルを採用／リモートを採用／競合を表示（差分エディター）」から選ぶ                                             | クラウドに保存。「リモートは各データ種別の直近 20 バージョンを保持、ローカルのバックアップは 30 日後に削除」                                                              | `machine` / `machine-overridable` スコープの設定は同期しない。`settingsSync.ignoredSettings` などで利用者が除外できる。「Show Synced Data」で過去の版を確認して復元する                             | <https://code.visualstudio.com/docs/configure/settings-sync>                                                                                                             |
| Windows Terminal                                    | 専用のエクスポート UI は確認できなかった。設定ファイルを直接編集する                                                                                         | `settings.json` 1 ファイル。第三者の解説では、保存のたびにタイムスタンプ付きの自動バックアップ（`settings.json.<日時>.backup`）が作られ、手動ではファイルをコピーして戻す | 設定全体を 1 ファイルで持つ。**ウィンドウの位置・サイズ（`initialPosition`、`launchMode`）も同じファイルに入る**（公式）                                                                            | 公式 <https://learn.microsoft.com/en-us/windows/terminal/customize-settings/startup>、解説 <https://pureinfotech.com/backup-restore-settings-windows-terminal>（第三者） |
| TweetDeck（過去の製品）                             | TweetDeck アカウントを作り、各端末で「Settings → Sync」からアカウントを連携する                                                                              | サーバー側（クラウド）に保存                                                                                                                                              | カラムとグループ、設定を端末間で同期する                                                                                                                                                            | 検索結果の抜粋のみ（<https://blog.twitter.com/2009/get-in-sync>）。**ページ本体は 403 で開けず、内容は未確認**                                                           |
| Tweeten（TweetDeck 拡張）                           | 公式サイトのトップページには、エクスポート／インポート／バックアップの記載は**見当たらなかった**                                                             | —                                                                                                                                                                         | —                                                                                                                                                                                                   | <https://tweetenapp.com/>（記載が無いことは機能が無い証明ではない）                                                                                                      |
| Phanpy（Mastodon クライアント、複数カラム表示あり） | README に複数カラム表示の記載はあるが、設定のエクスポート／インポートの記載は**見当たらなかった**（README の先頭 10 万文字を確認）                           | —                                                                                                                                                                         | —                                                                                                                                                                                                   | <https://github.com/cheeaun/phanpy>（同上）                                                                                                                              |

調査できなかった対象: Firefox のプロファイルのバックアップ（サポートページが読み込めなかった）、Slack・Discord などのチャット系アプリ（今回の対象外とした）。確認していない内容は事例として書いていない。

### 9.2 本調査への示唆

| 示唆                                                           | 根拠                                                                                      | 本推奨案との関係                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 端末固有の設定は、エクスポートから除く                         | VS Code のプロファイル（ローカルパスを指す設定を除外）、Settings Sync（machine スコープ） | §3 の除外方針と一致する                                                                        |
| ウィンドウ位置を設定ファイルに含めるアプリもある               | Windows Terminal                                                                          | 位置を含める設計は他にもあるが、画面構成が違う端末への移行を前提にする本機能では除外する（§3） |
| 変更の前に過去の版を残す                                       | VS Code（20 バージョン、30 日）、Windows Terminal（自動バックアップ）                     | リストア前の自動退避と世代数の制限（§8）と一致する                                             |
| 競合時は置き換え（どちらを採用するか）を選ばせる。差分は別画面 | VS Code の Settings Sync                                                                  | 全置換 + 確認画面（§5）と整合する                                                              |
| ファイル 1 つのエクスポートと、サーバー同期の 2 系統がある     | VS Code、TweetDeck                                                                        | 本アプリにはサーバーが無いため、ファイル方式のみとする                                         |
| **アカウントの付け替え（紐づけ）を伴うインポートの事例**       | 調査した範囲には見つからなかった                                                          | 紐づけ画面は本機能で新規に設計する部分で、先行事例による裏付けは無い                           |

---

## 10. 形式仕様（Quint / Alloy）との整合

モデルの本文は Issue #206 の本文にあり、それと照合した。

| モデルの要素                                                                                                                                     | 推奨案との対応                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| フェーズ `Idle → Mapping → Restored`（`startMapping`、`assign`、`restore`、`stay`）                                                              | §2.1 の流れと一致。モデルは Mapping の間に紐づけを**追加するだけ**で、変更・取り消しは表現していない。実際の UI は選択を変えられるが、**復元の確定時点の紐づけ表**だけが不変条件の対象になるため、矛盾しない |
| `assign`: 同じバックアップ内アカウントの二重割り当ては不可（`not(mapping.keys().contains(b))`、Alloy の `no b.(Sys.mapping)`）                   | 紐づけ画面は、バックアップ内アカウントごとに選択肢を 1 つだけ持つ。異なるバックアップ内アカウントを同じ復元先に割り当てることは、モデルが禁止していないので許可する（§2.1）                                  |
| `restore` の前提 `mapping.keys().size() > 0`（Alloy の `some Sys.mapping`）                                                                      | 「復元」ボタンは、紐づけが 1 件以上のときだけ有効（§2.1、§4）                                                                                                                                                |
| `invRestoredUsesMapping` / `invTargetsValid`: 復元されたカラムは、指定した紐づけ先だけを参照する。紐づけの無いアカウントのカラムは参照を持たない | §4 の推奨 A（紐づけ済みのカラムだけを復元し、`accountId` を紐づけ先に差し替える）と一致する。選択肢 B（全件必須）と C（既定アカウントへ自動割り当て）は採用しない                                            |
| `invNoRestoreBeforeDone`: Restored に達するまでカラムは 1 つも復元されない                                                                       | 「検証 → 変換 → 保存 → WebView の再生成」の順にし、確定前に既存のカラムや WebView を変更しない（§8）                                                                                                         |
| `invSettingsWithRestore`: 設定の復元済みと `Restored` は同値                                                                                     | ストアを 1 回で置き換え、1 回保存する（§7.1）ことで、カラムと設定が同時に反映される                                                                                                                          |
| `invNoCredentials`: バックアップにログイン情報は含まれない                                                                                       | Cookie と `dataDirectory` を含めない。含める項目を列挙するホワイトリスト方式で、型の段階で担保する（§1、§3）                                                                                                 |
| 未指定アカウントの扱い、全置換かマージか                                                                                                         | モデルは固定していない。§4 と §5 で比較し、推奨を示した                                                                                                                                                      |

**モデルに無い要素（差異）**

| 要素                                      | 推奨案での扱い                                                                                | モデルの不変条件への影響                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `external` カラム（アカウントに属さない） | 紐づけ対象外で**常に復元**する。`accountId` には再採番後の自分の ID を入れる（§0.2 の 5、§4） | モデルの「復元されたカラムは、指定した紐づけ先だけを参照する」は、`accountId` が復元先アカウントを指すカラムについての条件。`external` は復元先アカウントを参照しないので、条件に反しないが、**モデルの `restoredCols` の定義（紐づけ済みのものだけ）とは異なる**。シナリオに追加して再承認を得ることを推奨する |
| プリセット内のカラム                      | 同じ紐づけ表で `accountId` を差し替える。紐づけの無いアカウントのカラムは取り除く             | モデルはプリセットを持たない。同じ規則を適用するので、不変条件の趣旨は保たれる                                                                                                                                                                                                                                  |
| `accounts` を置換しない                   | 復元先の既存アカウントをそのまま使う                                                          | モデルの `TargetAccount`（事前にログイン済み）と一致する                                                                                                                                                                                                                                                        |
| 復元後の再実行（`Restored → Idle`）       | 可能とする（再度インポートできる）。ただし全置換のため、前回の結果を置き換える                | モデルは `Restored` で `stay` するだけで、再実行を表現していない。差異として明記する                                                                                                                                                                                                                            |

---

## 11. 推奨設計の概要

1. **エクスポート**: メイン専用の Rust コマンド（例: `export_backup`）。`AppSettingsData` から DTO を作る（`schemaVersion: 1`、端末依存項目と `dataDirectory` を除外、ホワイトリスト方式）。ファイルへの保存はプラットフォーム層（desktop は `tauri-plugin-dialog`、Android は一時ファイル → SAF）。
2. **インポート（検証）**: メイン専用のコマンド（例: `read_backup`）。ファイルを選択し、サイズ・JSON・`format`・`schemaVersion` を検査して、バックアップ内のアカウント一覧とカラム数を返す。この時点では何も変更しない。
3. **紐づけ UI**: React のダイアログ。自動候補は `xUserId` が両方設定済みで一致する場合だけ。確認画面に「復元されるカラム N / スキップ M / カスタム CSS を含む」と、全置換の警告を出す。
4. **適用**: 紐づけ表で `accountId` を差し替え、カラム ID を再採番し、`customUrl` などを検証したうえで、直前の設定をタイムスタンプ付きで退避する。ストアを 1 回で置き換え、1 回保存する（失敗を検知する）。続いて、旧カラムの WebView を全て破棄し、`rebuildWebviews` で再生成する。成功の確認後に、置き換えられた `external` カラムのデータ領域を削除する。
5. **前提整備（独立した変更を推奨）**: アカウント追加時にも `xUserId` を取得して保存する（§2.3 の 1）。

### 残るリスク

- `xUserId` の充足率が低いと、自動候補はほとんど効かない（新規追加のアカウントは前提整備で改善するが、既存のアカウントは再認証を待つ）。実データでの充足率は未計測。
- Android の実機での確認が必要な点: SAF の入出力、復元後の WebView の描画、Profile API 非対応端末での Cookie 切り替え（§7.2）。
- Linux と macOS の実機でのダイアログの動作は未確認。
- Android の JNI と ProGuard の keep ルールの同期漏れ（リリースビルドでしか顕在化しない）。
- 全置換のため、紐づけの無いカラムは復元で失われ、後から差分だけを取り込めない（§4）。
- 実装に進む場合は、Gherkin の仕様化と承認が必要（`@manual`: Android の SAF、PC ↔ Android の移行、復元後の実機表示）。

---

## 解消した未実施事項と、解消できなかった事項

| 一次レポートの未実施事項                                         | 状態                                                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公式ドキュメントの URL 出典（Tauri v2 dialog / fs、Android SAF） | **解消**（§6.2）。ただし `ContentResolver` のクラスリファレンスは本文が取得できなかったため、公式ガイドと既存実装で裏付けた                                                   |
| P3（他クライアント・一般アプリの事例）                           | **解消（一部）**（§9）。VS Code と Windows Terminal は確認済み。TweetDeck はページ本体が 403 で未確認、Tweeten と Phanpy は記載が見当たらなかった。Firefox は読み込めなかった |
| `xUserId` の根拠（書き込み経路）                                 | **解消**（§2.2）。全経路を追跡した                                                                                                                                            |
| `xUserId` の実データでの充足率                                   | **解消できない**。ユーザー端末の `settings.json` が必要で、この環境では計測できない（§0.3）                                                                                   |
| Android のリストア後の WebView 再構成手順                        | **解消（コード上）**（§7.2）。実機での描画は **[要検証]**                                                                                                                     |
| コード参照の照合                                                 | **解消**（§0.2）。ずれ 4 件と事実誤り 3 件を訂正した                                                                                                                          |
| モデル本文との照合                                               | **解消**（§10）。Issue #206 の本文を取得して照合した                                                                                                                          |
| macOS / Linux / Android の実機での動作                           | **解消できない**。実機が必要                                                                                                                                                  |

# 再認証を「新規ログイン→対象アカウント上書き」に変更する設計

作成日: 2026-07-06 / 対象: Multi Column X（Tauri v2 + React 19 + Rust + Android/Kotlin）

## 背景 / 問題

登録済みアカウントの再認証機能（`feature/account-reauth` ブランチで実装済み）は、既存アカウントの
セッション領域（desktop: `dataDirectory` / mobile: `account-{accountId}` プロファイル）を **再利用**して
`x.com/login` を開いている。そのため既存 Cookie が残った状態でログイン画面が開き、「保持済みセッションを
再利用している」挙動になっている。

本来の再認証は「**同一アカウントのログイン処理をユーザーが再度行う**」ものであり、通常のアカウント追加と
同じく**まっさらな新規ログイン**で始まり、最終的に（新規追加ではなく）**指定アカウントの内容を上書き**する
のが正しい。

## 確定要求

1. 再認証は既存セッションを一切使わず、**空の一時プロファイルで新規ログイン**する（＝アカウント追加と同じ体験）。
2. ログイン後、twid Cookie で同一性照合する（既存要求を維持）。
3. **一致 or 初回**（`xUserId` 未登録）→ 対象アカウントのセッションを**新ログイン結果で上書き**し、`xUserId` を
   記録して**全カラム再読込**（`recreateAllWebviews()`）。
4. **不一致 / 識別子取得失敗 / キャンセル**→ 一時セッションを破棄し、**元セッションは温存**（更新中断・警告）。
5. 対象: desktop ＋ mobile（Android）両方を一括対応。

## 非機能 / 制約

- desktop: カラムは `account.dataDirectory` を WebView 生成時に都度参照する（`useColumns.ts` 等で確認済み）。
  よってストアの `dataDirectory` を差し替えて `recreateAllWebviews()` すれば新セッションに切り替わる。
- mobile: **プロファイル対応端末では AddAccount のログイン用 WebView とカラム用 WebView が同じ
  `account-{accountId}` プロファイルを共有**し、カラムはそのプロファイルを直接使う（`x_cookies.txt` は
  非対応端末向けフォールバックスナップショット。`WebViewProfiles.migrateLegacyCookies` は**プロファイル
  初回作成時のみ**実行）。したがって mobile の「上書き」はファイル更新だけでは既存プロファイルに反映されず、
  一時プロファイルの Cookie を対象プロファイルの CookieManager へ転記する必要がある。
- serde: Tauri v2 は JS→Rust のケース変換をしないため、新フィールドは `#[serde(rename)]` 必須。
- Windows WebView2: プロファイルフォルダはウィンドウ生存中ロックされるため、`dataDirectory` の削除は
  ウィンドウを閉じてから行う（ベストエフォート）。
- Android の JNI/ProGuard: `MainActivity` の呼び出しメソッドシグネチャを変えたら
  `proguard-rules.pro` を同期する（CLAUDE.md）。本設計では **Kotlin 内部で一時プロファイル ID を生成**し、
  JNI シグネチャ（`launchReauthAccount(String, String?)`）を**変更しない**ことで ProGuard 変更を回避する。

## 設計

### desktop

**Rust `reauth_account_window`（`#[cfg(desktop)]`, `src-tauri/src/commands/account.rs`）**

- 引数から既存 `data_directory` の**再利用をやめる**。代わりに新規 UUID で
  `accounts/account-{新uuid}` の空ディレクトリを作成し、その `dataDirectory` で `x.com/login` を開く。
- ポーリングで `/home` 到達 → `cookies_for_url` で twid を読む（従来どおり）。
- 完了イベント `ACCOUNT_REAUTH_COMPLETE` の payload に **`newDataDirectory` を追加**:
  `{ accountId, xUserId, newDataDirectory }`（`#[serde(rename = "newDataDirectory")]`）。
- コマンド戻り値 JSON にも `newDataDirectory` を含める（`{ accountId, windowLabel, newDataDirectory }`）。

**TS `useAccounts.startReauth`（desktop 分岐, `src/hooks/useAccounts.ts`）**

- listen した payload から `xUserId` と `newDataDirectory` を受け取る。
- `xUserId` が無い（失敗）→ ウィンドウを閉じ、**新 dir を削除**（`delete_account_data`）、失敗通知。
- `evaluateReauthIdentity(account.xUserId, xUserId)`:
  - `match` / `skip` → ウィンドウを閉じる → 旧 `dataDirectory` を退避 →
    `updateAccount(accountId, { xUserId, dataDirectory: newDataDirectory })` → **旧 dir を削除** →
    `recreateAllWebviews()` →（`skip` のときスキップ通知）。
  - `mismatch` → ウィンドウを閉じ、**新 dir を削除**、不一致通知（元 dir 温存）。
- キャンセル（`tauri://destroyed`）→ **新 dir を削除**、無通知。

**ストア `updateAccount`（`src/store/useAppStore.ts`）**

- 許可パッチに `dataDirectory` を追加: `Partial<Pick<Account, "label" | "color" | "xUserId" | "dataDirectory">>`。

### mobile（Android）

**Kotlin `AddAccount`（再認証モード）**

- `mode == "reauth"` のとき、WebView プロファイルに**一時 ID（`reauth-tmp-{UUID}`）** を使う
  （`profileId` を Kotlin 内部で生成し `WebViewProfiles.apply(webView, profileId, "reauth", filesDir)`）。
  → 対象アカウントのライブプロファイル・`x_cookies.txt` に触れずに**新規ログイン**する。
- `/home` 到達で一時プロファイルの CookieManager から Cookie 文字列を取得し `twidUserIdFromCookieString` で
  `xUserId` を抽出。
- 判定（`finishReauth`）:
  - `xUserId == null` → `reauth_mismatch`（対象に触れない）。
  - `expectedUserId` 非空かつ不一致 → `reauth_mismatch`（対象に触れない）。
  - 一致 or 初回 → **commit**: 対象プロファイル `account-{accountId}` の CookieManager を**クリア→新 Cookie 注入
    →flush**（`profile.cookieManager`）し、`accounts/account-{accountId}/x_cookies.txt` も新 Cookie で更新 →
    `reauth_complete`（本文 = xUserId）。
- キャンセル → `reauth_cancelled`。いずれの終了時も一時プロファイルは可能なら削除（後始末、失敗は警告に留める）。
- 純粋ロジック（Cookie 文字列の分解等）は既存 `WebViewProfiles.parseCookieString` / `TwidUtils` を再利用し、
  `:app:testUniversalDebugUnitTest` でテスト可能な範囲を単体テストする。CookieManager/Profile を伴う commit の
  ランタイム挙動は**実機検証が必要**。

**Rust `reauth_account_window`（`#[cfg(mobile)]`）/ bridge**

- 既存の3センチネル（`reauth_complete` / `reauth_mismatch` / `reauth_cancelled`）ポーリングは維持。
- 一時プロファイル ID は Kotlin 内部生成のため、`launch_reauth_account_activity(account_id, expected_user_id)`
  の JNI シグネチャは**変更しない**（ProGuard 変更不要）。
- `reauth_complete` 本文（xUserId）を読んで `{ accountId, xUserId }` を返すのは従来どおり。

**TS `useAccounts.startReauth`（mobile 分岐）**

- ブロッキング invoke の戻り `{ accountId, xUserId }` を受け、`xUserId` 無し→失敗通知。
- 一致/初回 → `updateAccount(accountId, { xUserId })`（**dataDirectory は据置**。Cookie は Kotlin が対象プロファイルへ
  反映済み）→ `recreateAllWebviews()` →（skip 通知）。
- 不一致（Rust が `Err("account-mismatch")`）→ 不一致通知。キャンセル/タイムアウト → 無通知。

## コンポーネント境界と責務

- **desktop 上書き** = ストアの `dataDirectory` 差し替え＋旧 dir 削除（ファイル移動なし・ロック回避）。
- **mobile 上書き** = 一時プロファイル→対象プロファイルへの Cookie 転記＋スナップショット更新（`dataDirectory` 不変）。
- 同一性照合（`evaluateReauthIdentity` / `parseTwidUserId` / `twidUserIdFromCookieString`）は既存純粋関数を再利用。
- 通知（`reauthNotice` / `ConfirmDialog singleButton`）・UI（再認証ボタン）は現状維持。

## エラーハンドリング

- desktop の新 dir 削除は WebView2 ロックのためベストエフォート（失敗しても致命的でない。孤児 dir が稀に残る
  可能性は許容）。ウィンドウ close 後に削除する。
- mobile commit で対象プロファイルへの転記に失敗した場合はログ警告に留め、`reauth_complete` は書くが
  `x_cookies.txt` フォールバックで回復可能（次回カラム表示時の migrate 経路）。
- 照合不一致・失敗時は対象セッションを一切変更しない（温存が最優先）。

## テスト方針

- **vitest**: `useAccounts.startReauth` の desktop 分岐（一致→dataDirectory 差替＋旧 dir 削除呼び出し＋reload、
  不一致/失敗/キャンセル→新 dir 削除・更新なし）、mobile 分岐（dataDirectory 据置）。`updateAccount` の
  dataDirectory 更新。
- **Rust**: desktop payload に `newDataDirectory` を含む構築（純粋化できる範囲）。
- **Kotlin**: 一時プロファイル ID 生成・Cookie 文字列処理など純粋部分。commit のランタイムは実機検証。
- **プロパティ/Story**: 既存を維持（回帰なし）。

## 完了基準

- `npm run typecheck` / `lint` / `lint:rust` / `npm test` / `test:story` / `test:property` / `build` グリーン。
- Android `:app:testUniversalDebugUnitTest` グリーン。
- desktop 手動確認: 再認証で既存 Cookie の残らない新規ログイン画面が出る → 同一アカウントで全カラム更新、
  別アカウントで警告・元セッション温存。
- mobile: 実機で新規ログイン・上書き・不一致温存を確認（この環境では未検証、要実機）。

## 未確定 / 実装時判断

- desktop 新 dir 削除失敗時のリトライ要否（当面ベストエフォート）。
- mobile 一時プロファイルの確実な後始末（ProfileStore の削除 API の可否）。
- mobile commit の Cookie クリア方式（`removeAllCookies` の非同期完了待ちの扱い）。

# 更新インストール中の処理状態表示 設計

## 背景・課題

更新があった場合に「更新する」を押すと、内部では `updater.install()`
（desktop: `downloadAndInstall()` + `relaunch()` / mobile: `install_apk_update`）
が走るが、ダウンロード進捗を一切拾っていない。ボタン文言が静的な「更新中...」のまま
長時間止まるため、ユーザーにはフリーズして動作していないように見える。

## ゴール

更新インストール中に処理状態（ダウンロード進捗バー + % とフェーズ文言）を表示し、
処理が進んでいることが分かるようにする。

## 設計

### データ型（`src/services/updater.ts`）

```ts
export type UpdateProgress =
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "installing" }
  | { phase: "restarting" };

export interface Updater {
  check(): Promise<AppUpdate | null>;
  install(onProgress?: (p: UpdateProgress) => void): Promise<void>;
}
```

### desktop install

`pending.downloadAndInstall(onEvent)` の進捗イベントを購読して通知する。

- `Started` → `total = contentLength ?? null`、`downloaded = 0` を通知
- `Progress` → `downloaded += chunkLength` を都度通知（% 算出に使う）
- `Finished` → `phase: "installing"` を通知
- `relaunch()` 直前 → `phase: "restarting"` を通知

### mobile install

Android の `downloadAndInstallApk` は Kotlin に投げっぱなしで JS へ進捗を返す
チャネルが無い。バイト単位進捗は大改修になるため YAGNI で対象外とし、
`phase: "downloading", total: null`（不確定）を1回通知してから `invoke` を待つ。

### hook（`src/hooks/useAppUpdater.ts`）

`installing: boolean` は残しつつ `progress: UpdateProgress | null` を追加。
`install()` がコールバックで `setProgress` を更新し、完了/失敗時に `null` に戻す。

### UI（`src/components/UpdateDialog/UpdateDialog.tsx`）

`progress` を受け取り表示する。

- `downloading` かつ `total` あり → 進捗バー（fill = %）+ 文言「ダウンロード中... NN%」
- `downloading` かつ `total` なし → 不確定バー +「ダウンロード中...」
- `installing` →「インストール中...」（不確定）
- `restarting` →「再起動中...」（不確定）

`installing` 中は両ボタン `disabled`（現状維持）。

## テスト（TDD / t-wada 流、日本語テスト名）

- `updater.test.ts`: desktop install がイベントを progress 通知へ変換する
- `useAppUpdater.test.ts`: install 実行中に progress を公開・更新し、完了で null に戻す
- `UpdateDialog.test.tsx`: progress に応じてバー・%・フェーズ文言を描画する

## 対象外（YAGNI）

- Android のバイト単位ダウンロード進捗（Kotlin/JNI/ProGuard 改修が必要）
- ダウンロード速度・残り時間の表示

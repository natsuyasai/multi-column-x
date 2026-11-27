---
description: "フェーズ6の後、integration-test.md の手動テスト項目のうちエージェントが自律実施できるものを実機（Windows の CDP / Android エミュレータ / Linux の WebKit インスペクタ）で実施し、結果を記録する"
user-invocable: true
argument-hint: "対象の integration-test.md のパス（省略時は現在のブランチの tmp/plans/*/integration-test.md）"
---

# 自律手動テスト（フェーズ6.5）

`integration-test-viewpoints`（フェーズ6）が出力した `integration-test.md` のうち、**エージェントが安全に実施できる項目は毎回エージェントが実施し、結果セルに記録する**。人間のテスターには、自律実施できなかった項目（と判断が要る項目）だけが残る状態にする。

スクリプトの使い方・実機操作のコツ・落とし穴は `reference.md` を参照。スクリプトは `scripts/` にある。試験対象のブランチにこのスキルが無い（未マージ）場合は、`reference.md` の「既知の落とし穴」の手順で `git show` から読み出して使う。

## 使うタイミング

- フェーズ6で `integration-test.md` を出力した直後、PR 作成（`feature-development-flow` のフェーズ7）の前
- 挙動不変のリファクタ・docs・CI のみの変更で `integration-test.md` が無い場合は対象外

## 対象外（このスキルでは扱わない）

- TalkBack など支援技術を使う項目、macOS の項目 → 「未実施（人間が実施）」のまま残す
- Linux は対象。ただし自律実施しにくい項目（実 Wayland ネイティブ表示、ポータルのスクリーンショット許可、GTK ネイティブダイアログのうち AT-SPI で操作できないもの）は末尾「Linux」の扱いに従う

## 1. 項目の振り分け（安全ルール）

各項目を読み、**自律実施 / 実施しない** に分ける。迷ったら実施しない。

### 実施してよい

- アプリ内 UI の表示・操作の確認（設定画面、ダイアログ、テーマ、表示言語、表示サイズ、カラム追加画面など）
- X の**閲覧**、および動画の取得（ダウンロード・保存ダイアログ操作）
- アプリ自身がテスト用に追加したデータ（テスト用カラム・テスト用に作ったプリセットなど）の追加・変更・削除
- 端末設定の変更（Android の font_scale・テーマ・回転・機内モード・表示言語）。**試験前の値を記録し、必ず戻す**

### 実施しない（禁止）

- **X への外部影響操作**: 投稿・返信・いいね・リポスト・フォロー・ブロック・ミュート・DM・プロフィール変更など、X のアカウント状態を変える操作
- **OS のシステム設定変更**（DPI、OS の表示言語・テーマ、ネットワーク設定など。Android エミュレータの端末設定は上記の許可範囲のみ）
- **既存のカラム・アカウント・プリセットの削除や上書き**（削除系はテスト用に追加したデータだけ）
- ユーザーの実データを壊しうる操作（バックアップ復元の実行、設定の初期化など）。実施する場合は退避済みのデータに対してだけ行い、その旨を結果に書く
- TalkBack 等の支援技術、macOS の操作

### Linux 固有の安全ルール

- **kill は試験対象の子孫プロセスだけ**。PID 指定で行い（`linux-procs.sh kill <root-pid> <pid>` は子孫であることを検証する）、`pkill -f` / `killall` / 名前での WebKitWebProcess の kill は禁止（自分のシェルや他アプリの WebKit を巻き込む）
- AppImage の改名・削除・置換は `~/mcx-test` やスクラッチに作った**写し**に限る（ビルド成果物そのものは動かさない）
- `gsettings` など OS の設定は変更しない（AT-SPI のために `toolkit-accessibility` を変えることも不可）。環境変数はプロセス単位でだけ設定する
- ユーザーデータ（`gstreamer-openh264/`、`accounts/` など）を動かす・消す項目は、退避してから行い、試験後に必ず戻す。戻したことは `linux-appdata.sh diff` 等で確認する
- **合成キー入力・マウス入力（`Atspi.generate_keyboard_event` / `generate_mouse_event`、XTest など）は原則使わない**。送り先はその時点でフォーカスのある窓で、他アプリに文字列や Enter が入りうる。DOM 操作は `wk.cjs`、ダイアログは `linux-dialog.py`（AT-SPI のアクション・テキスト設定）で行う。やむを得ず使う場合は直前にアクティブ窓が試験対象のダイアログであることを確認し、使ったことを報告に書く
- Wayland のスクリーンショット（ポータルの許可ダイアログが出る）は自動化しない。画面は `linux-shot.sh`（X11 窓）と `wk.cjs shot`（WebView 単位）で取る
- 起動前に空きメモリと `/tmp` の残骸を確認する（カラム多数＋残骸で OOM になりデスクトップが落ちた実績がある）。残骸の削除はユーザーの確認を取る

### 分類器に拒否された場合

auto mode の分類器が、アプリ内の削除確定などのタップを拒否することがある。その場合は**ユーザーに許可を求める**。他のエージェント（サブエージェント含む）やスクリプトに代行させて回避しない。許可が得られなければ「未実施（権限により中断）」と記録する。

### 代替手順

該当するデータが無いなどで手順どおり実施できない場合（例: 動画ツイートが TL に無い、再生できる投稿が無い）は、**同じ期待結果を確認できる代替手順**で実施してよい。ただし結果セルに「代替: 〇〇で確認」と必ず明記する。代替でも期待結果を確認できないなら「未実施」にして理由を書く。

## 2. 実施手順

1. **準備**
   - **退避前に、アプリが起動していないことを確認する**。Windows: `tasklist /FI "IMAGENAME eq multicolumnx.exe"`（起動中なら正常終了させてから退避する）。Linux: `pgrep -x multicolumnx`（`linux-appdata.sh` も起動中は拒否する）
   - 試験前のデータを退避する。Windows: `win-appdata.ps1 backup`（2 分以上かかることがある。タイムアウトを長めに、バックグラウンド実行推奨）。Android: `android-device.sh state-save`。Linux: `linux-appdata.sh backup <スクラッチ>/appdata-backup`（約 700MB）。退避先は**スクラッチ（リポジトリ外の一時ディレクトリ）**
   - **試験対象ブランチのビルド成果物が古くないか確認する**: Windows は exe の更新時刻（`(Get-Item src-tauri/target/release/multicolumnx.exe).LastWriteTime`）、Linux は AppImage の更新時刻（`stat -c %y src-tauri/target/release/bundle/appimage/*.AppImage`）を、HEAD のコミット時刻（`git log -1 --format=%ci`）と比べ、成果物のほうが古ければ再ビルドする
   - ビルド: Windows は `npm run tauri:build`（署名鍵が無く NSIS 段階で失敗するが exe は `src-tauri/target/release/multicolumnx.exe` に生成される。exe の更新時刻で確認する）。Linux は `npm run tauri:build -- --bundles appimage`（署名鍵が無いと署名段階で失敗しうるが AppImage は生成される。更新時刻で確認する）。AppImage の同梱物（GStreamer・libwayland 等）が対象の項目は CI 相当の Docker（ubuntu:24.04）ビルドが要る（手順は `docs/release/pre-release-checklist.md` の Linux 実施記録と `docs/development/linux-webview-notes.md`「ローカルでのフルビルド」）。Android は `npm run tauri:android:build -- --debug --apk --target x86_64` → `android-device.sh install <apk>`（`adb install -r` でログイン状態を維持）
   - Windows と Android を並行実施する場合、cargo のビルドロックを待つことがある。同時に走らせず順に起動する（ロック待ちは異常ではない）
2. **起動**: Windows は `win-launch.ps1`（CDP 有効）→ `cdp.cjs pages` で接続確認。Linux は `linux-launch.sh`（インスペクタ有効）→ `wk.cjs targets` で接続確認。Android は `android-device.sh start`
3. **操作と検証**
   - テスト用カラムの追加・削除は `col-add-ext.cjs` / `col-close.cjs`、アプリ終了中の `settings.json` 編集は `settings-edit.cjs`（`reference.md`）
   - ポップアップ / コンポーズなどを実クリックで開けないときは `open.cjs`（invoke で開く）を代替手順として使える（`reference.md`）
   - Windows は CDP（`cdp.cjs`）で DOM を読む・操作する。メイン UI は `http://tauri.localhost/`、カラムはアカウントごとの別ポート。OS ネイティブの保存ダイアログは `win-dialog.ps1`、画面は `win-shot.ps1`
   - Android は `android-device.sh`（`tap-text` / `find` で座標特定、`shot` で画面確認）
   - Linux は `wk.cjs`（WebKit インスペクタで DOM を読む・操作する・WebView 単位のスクショ）、`linux-window.py` / `xwininfo`（窓の座標・サイズ・リサイズ）、`linux-procs.sh`（子孫プロセス・`/proc`・マウント）、`linux-dialog.py`（GTK 保存ダイアログ）。詳細は末尾「Linux」
   - **見た目だけでなく DOM・設定値・ファイルなどの客観的な根拠**を 1 項目につき 1 つ以上取る（例: 計算済みスタイル、`settings.json` の値、保存されたファイルのサイズ）
   - 1 項目ごとに結果を判定する。期待結果と違えば **NG** とし、再現手順と根拠を残す（勝手に直さず、メインへ報告する）
4. **証拠の保存**: スクリーンショットと実行ログは**スクラッチ**（`tmp/` も不可。リポジトリ配下に置かない）へ。結果セルにはファイル名か短い根拠を書く。コミットしない
5. **結果記録**: `integration-test.md` の**該当セルだけ**を最小限に編集する（他の行・他セルは触らない。並行して別エージェントが同じファイルを編集している場合があるため、編集前に必ず読み直す）。書式:
   - `Win: OK（根拠）` / `Android: OK（根拠）` / `Linux: OK（根拠）` を結果セルの前置きにする。例: `Android: OK（font_scale 1.3。…） / Win: OK（日本語。…。win-test/shots/set-ja-win.png）`
   - 一部だけ確認できた場合は `Linux: OK（一部。確認できたこと / 確認できなかったこと）`
   - NG は `Win: NG（現象・根拠）`、実施しない項目は `未実施（理由）` と書く
   - 代替手順を使ったら `代替: …` を明記する
6. **後片付け**（必ず実施。失敗しても飛ばさない）
   - アプリを正常終了する: Windows は `win-closewait.ps1`（`win-window.ps1 close` で主窓にだけ WM_CLOSE を送り、プロセス消滅を待って経過時間を出す。タイトル空の 16x16 ヘルパー窓には送らない）。残ったプロセスは最後の手段としてだけ強制終了する
   - Windows: `win-appdata.ps1 diff` で `settings.json` が退避時と同一か意味比較し（差分のキーのパスが出る。`windowBounds` だけの差は `-IgnoreWindowBounds` で除外。`windowBounds` は client サイズで保存されるので `win-window.ps1 info` の client 値と比べる）、意図しない差分があれば `restore-settings` で戻す。テスト用に追加したカラム等が残っていないことも確認する
   - Linux: `linux-closewait.sh <pid>` で正常終了し（`GDK_BACKEND=x11` 起動なので窓経由で終了できる。強制終了はしない）、`linux-appdata.sh diff <退避> --ignore-window-bounds` で `settings.json` が退避時と同一か確認する（#287 より前のビルドでは終了時に `windowBounds` の高さが増える。#287 を含むビルドで増えるなら NG（要判断）として記録し、除外したら結果に書く）。意図しない差分は `restore-settings`、データを動かした項目は `restore-all`（アプリ終了後に実行）で戻す。`linux-procs.sh mounts` で `/tmp/.mount_*` が残っていないことも確認する
   - Android: 端末設定を `state-restore` で戻し、`state-save` し直して記録と一致することを確認する。機内モードにしたなら必ず解除する
   - 一時ファイル（保存した動画、退避データ）はスクラッチ内に限り、リポジトリに混ぜない
7. **報告**: 実施した項目数・OK/NG/未実施の内訳、NG の詳細、代替手順を使った項目、分類器に拒否された項目、後片付けの確認結果（settings.json の一致、端末設定の復元）を報告する

## 3. サブエージェントへの委譲

CLAUDE.md の規則どおり、実機操作は判断を伴うため **`model: sonnet`** のサブエージェントに委譲する（ビルドやコマンド実行だけの機械的な作業は `haiku` でもよい）。`Agent` 委譲の前に「メイン=<モデル名> / サブエージェント=<モデル名>」を出力する。

委譲プロンプトに必ず入れる項目:

- 対象の `integration-test.md` の絶対パスと、実施対象の項目 ID（Win / Android / Linux それぞれ）
- 検証するブランチ・ビルド手順・exe / APK / AppImage のパス
- このスキルの「安全ルール」（実施する・しない）全文、またはこのスキルを読むよう指示
- スクラッチのパス（退避・証拠の保存先）、Android の serial（例 `emulator-5554`）、Linux のインスペクタのポート（`MCX_WK_PORT`）
- 結果セルの書式（`Win: OK（根拠）` 等）と「該当セルだけ最小限に編集」
- 分類器に拒否されたらユーザーへ確認を求め、代行させない、という指示
- コミットしない（結果の `integration-test.md` は `tmp/` 配下でコミット対象外）。コミットが必要な作業を含めるなら、トレーラーはメインが指定した文字列をそのまま使う
- 判断に迷ったら止まらず、報告に「要確認」と書いて進める

## 4. 禁止事項

- 安全ルールの「実施しない」操作を、ユーザーの明示許可なしに行うこと
- 後片付け（データ・端末設定の復元）をせずに報告すること
- 実施していない項目に OK を書くこと、根拠のない OK を書くこと
- 証拠や退避データをリポジトリ内に置く・コミットすること

## Linux

Ubuntu 26.04 / GNOME（Wayland セッション）、WebKitGTK 2.52 で確認済みの方式。スクリプトの引数・プロトコルの注意・既知の落とし穴は `reference.md` の「Linux スクリプト」以降を参照。カラムの仕様は `docs/development/linux-column-spec.md`、WebKitGTK 固有の注意は `docs/development/linux-webview-notes.md`。

### 方式

- **WebView の DOM・スクショ**: アプリを環境変数 `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:<port>` 付きで起動すると WebKit リモートインスペクタが開く（リリースビルドでも可）。`wk.cjs` がメイン UI・各カラムへ接続し、式の評価と WebView 単位のスクリーンショットができる。Tauri の `invoke` はメイン UI から呼べるが ACL の制約を受ける
- **窓の操作**: 既定で `GDK_BACKEND=x11`（XWayland）起動。`xwininfo` / `linux-window.py` で窓の座標・サイズを読み、リサイズし、主窓にだけ `WM_DELETE_WINDOW` を送って正常終了できる。**アプリ本体が `WAYLAND_DISPLAY` を見て `GDK_BACKEND=x11` を自分で設定する**（`src-tauri/src/main.rs`）ため、Wayland セッションでも現行ビルドは常に XWayland で動く。`--wayland` を付けても実効は同じ
- **GTK ネイティブダイアログ**: AT-SPI（`linux-dialog.py`）で保存ダイアログの既定ファイル名の取得・保存先指定・キャンセルができる（OS 設定は変えずに動いた）
- **プロセス・マウント**: `linux-procs.sh` で子孫プロセスの列挙、`environ` / `fd` / `maps` の旧マウント名検査、`/tmp/.mount_*` の確認。`ffprobe` で保存した動画を検証する

### 手順

1. **準備**: 上の「実施手順 1」の Linux 向け記述に従う（起動していないこと・退避・ビルド鮮度）。AppImage は読み取り専用で使い、改名・置換が要る項目は写しを使う
2. **起動**: `linux-launch.sh <AppImage> --pid-file <スクラッチ>/app.pid --log <スクラッチ>/app.log`。空きメモリと `/tmp` の残骸が表示され、既に起動していれば拒否される。インスペクタが応答し主窓が見えるまで待つ。起動後の PID は AppImage 本体のプロセス（`/tmp/.mount_*/usr/bin/multicolumnx`）。**「今すぐ再起動」や `relaunch_app` の後は PID が変わる**ので `pgrep -x multicolumnx` で取り直す
3. **操作と検証**: 1 項目につき客観的な根拠を 1 つ以上取る

   | 確認したいこと                               | 手段                                                                                                                     |
   | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
   | 画面の DOM・計算済みスタイル・設定画面の状態 | `wk.cjs eval main "<式>"`、カラムは `wk.cjs eval <URL 部分一致> "<式>"`                                                  |
   | 見た目                                       | `wk.cjs shot <対象> <png>`（WebView 単位。非表示のカラムは撮れない）、主窓の枠は `linux-shot.sh <png>`                   |
   | カラム・主窓の座標・幅（クリップ、リサイズ） | `linux-window.py info` / `xwininfo -root -tree`、リサイズは `linux-window.py resize <w> <h>`                             |
   | 再起動・更新後に旧マウントを参照していないか | `linux-procs.sh mounts`、`linux-procs.sh maps <pid> <旧マウント名>`                                                      |
   | WebProcess クラッシュからの復旧              | `linux-procs.sh kill <root-pid> <WebKitWebProcess の pid>`（`tree` で子孫を確認）→ 子孫数・`wk.cjs targets` の回復を確認 |
   | 保存ダイアログ・保存したファイル             | `linux-dialog.py info / name / save <path> / cancel`、保存後は存在・サイズ・`ffprobe`                                    |
   | 設定値・永続化                               | `linux-appdata.sh diff`、`settings.json` を直接読む                                                                      |
   | 起動エラー（EGL 等）                         | `--log` のログを `grep`                                                                                                  |

4. **後片付け**: 上の「実施手順 6」の Linux 向け記述に従う

### 自律実施できない・しにくいもの

- **実 Wayland ネイティブでの表示・GUI 操作・スクショ**: 現行ビルドは常に XWayland で動くため、ネイティブ Wayland 固有の挙動は確認できない。必要な項目は「未実施（人間が実施）」。Wayland セッション上で XWayland として動かしたことは根拠に書ける（`EGL_BAD_PARAMETER` が出ないことなど）が、項目の期待が「ネイティブ Wayland」ならその旨を書いて `Linux: OK（一部。XWayland）` とする
- **GTK 保存ダイアログ以外のネイティブ UI**（OS のポータル、通知など）や、AT-SPI のツリーに現れない操作: 未実施（人間が実施）
- **X のログイン状態が要る操作**: 既存アカウントの Cookie で閲覧だけに留める（外部影響操作は禁止）
- **更新試験（L-14 のような `updater-test` ビルド）**: 試験用ビルドは普段使いのインストールを同じ `identifier` で上書きするため、実施の可否をユーザーに確認する（`docs/development/updater-test-notes.md`）
- 代替手順を使ったら `代替: …` を明記し、期待結果を確認できないなら「未実施（理由）」とする（「代替手順」の節と同じ）

### 結果の書式

`Linux: OK（根拠）` / `Linux: OK（一部。〇〇のみ確認、△△は人間が確認）` / `Linux: NG（現象・根拠）` / `未実施（理由）`。例:

```
Linux: OK（X11 起動。linux-window.py resize 800 900 後、xwininfo でカラム 3 枚の幅が 350/350/100 に縮み x>=0。logs/linux-resize.txt）
```

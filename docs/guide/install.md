# インストール

最新版は GitHub の [最新リリースのページ](https://github.com/natsuyasai/multi-column-x/releases/latest) からダウンロードします。ページ下部の **Assets** を開き、お使いの OS に合ったファイルを選んでください。

> 以降のファイル名にある `<バージョン>` の部分はバージョン番号で、リリースごとに変わります。

| OS      | ダウンロードするファイル（Assets 内）                                    |
| ------- | ------------------------------------------------------------------------ |
| Windows | `MultiColumnX_<バージョン>_x64-setup.exe`                                |
| Linux   | `MultiColumnX_<バージョン>_amd64.AppImage`（推奨）または `..._amd64.deb` |
| Android | `MultiColumnX_<バージョン>_universal.apk`                                |

> `.sig` や `.sha256` で終わるファイルと `latest.json` は、アプリの更新や検証に使うファイルです。ダウンロードする必要はありません。

> Multi Column X は OS のコード署名を行っていないため、インストール時に「提供元が確認できない」旨の警告が表示されることがあります。これは仕様です。配布元（GitHub Releases）からダウンロードしたファイルであることを確認のうえ、続行してください。

## Windows

1. 最新リリースの Assets から `MultiColumnX_<バージョン>_x64-setup.exe`（インストーラー）をダウンロードします。
2. ダブルクリックで実行します。
3. **SmartScreen の警告**（「Windows によって PC が保護されました」）が出た場合は、
   **「詳細情報」** をクリック → **「実行」** ボタンを押すとインストールが続行できます。
4. 画面の指示に従ってインストールします。

![SmartScreen の警告画面](images/windows-smartscreen-details.png)

_最初は「実行しない」しか表示されません。「詳細情報」をクリックします。_

![SmartScreen の警告画面（詳細情報を開いた状態）](images/windows-smartscreen-run.png)

_「詳細情報」を開くと「実行」ボタンが表示されます。アプリ名と発行元（不明な発行元）を確認して「実行」を押します。_

## Linux

次のいずれかを利用できます（AppImage 版はインストールスクリプトでも導入できます。[下記](#インストールスクリプトを使う-appimage-版) を参照）。

- **AppImage**（推奨・アプリ本体の自動更新に対応）
  1. Assets から `MultiColumnX_<バージョン>_amd64.AppImage` をダウンロードします。
  2. 実行権限を付与します: `chmod +x MultiColumnX_*.AppImage`
  3. ダブルクリック、または `./MultiColumnX_*.AppImage` で起動します。
- **deb パッケージ**（Debian / Ubuntu 系・手動更新）
  1. Assets から `MultiColumnX_<バージョン>_amd64.deb` をダウンロードします。
  2. `sudo apt install ./MultiColumnX_*.deb` でインストールします。

### インストールスクリプトを使う（AppImage 版）

Assets の `install.sh` を使うと、AppImage のダウンロードからアプリケーションメニューへの登録までを自動で行えます。

- 最新の AppImage を `~/.local/bin/MultiColumnX.AppImage` に配置します。
- アイコンとデスクトップエントリ（`~/.local/share/applications/multi-column-x.desktop`）を作成し、アプリケーションメニューから起動できるようにします。
- 必要なコマンドは `curl` です。

**ワンライナーでダウンロードしてインストールする**

```bash
bash <(curl -fsSL https://github.com/natsuyasai/multi-column-x/releases/latest/download/install.sh)
```

すでにインストール済みの場合は上書きの確認（`y` / `N`）が表示されます。確認の入力を受け付けるため、`curl ... | bash` ではなく上記の形式で実行してください。

**スクリプトを保存してから実行する**

1. Assets から `install.sh` をダウンロードします。
2. 実行権限を付与して実行します。

```bash
chmod +x install.sh
./install.sh
```

**アンインストール**

AppImage・アイコン・デスクトップエントリを削除します。

```bash
./install.sh --uninstall
```

ワンライナーで実行する場合は、次のとおりです。

```bash
bash <(curl -fsSL https://github.com/natsuyasai/multi-column-x/releases/latest/download/install.sh) --uninstall
```

> `~/.local/bin` が `PATH` に含まれていない場合は、インストール完了時に追記方法が表示されます（アプリケーションメニューからの起動には影響しません）。
> AppImage 版は動画の再生に必要な H.264 コーデックを同梱していません。インストール完了時に、お使いのディストリビューション向けの導入コマンドが表示されます。アプリ内の案内から有効化することもできます（[設定](./settings#アプリ全体設定) の「動画再生（Linux）」を参照）。

## Android

1. 最新リリースの Assets から `MultiColumnX_<バージョン>_universal.apk` をダウンロードします。
2. インストール時に **「不明なアプリのインストール」** を求められた場合は、設定でこのアプリ（ブラウザやファイルアプリ）からのインストールを許可します。
3. APK を開いてインストールします。
4. **Google Play プロテクト** の「アプリのスキャンをおすすめします」が表示された場合は、**「アプリをスキャン」** を選ぶか、**「詳細」** を開いて **「スキャンせずにインストール」** を選ぶとインストールを続行できます。

![Google Play プロテクトの確認画面](images/android-install-scan.png)

_APK は Google Play 経由ではないため、スキャンの確認が表示されることがあります。「詳細」を押すと続行の選択肢が現れます。_

![Google Play プロテクトの確認画面（詳細を開いた状態）](images/android-install-scan-details.png)

_「詳細」を開いた状態。「スキャンせずにインストール」でそのまま進められます。_

> 表示される文言や選択肢は、Android のバージョンや端末によって異なります。

> インストール後のアプリ本体のバージョンアップについては [アプリの更新](./update) を参照してください。

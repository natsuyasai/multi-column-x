# リリース CI/CD 実装計画（サブプロジェクト1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `v*` タグ push でトリガーされ、Windows/Linux のデスクトップ成果物と Android APK を自動ビルドし、署名付き `latest.json` を含めて GitHub Releases に公開する CI/CD を構築する。

**Architecture:** `release.yml` を新規追加。`create-release`（draft 作成 + version/tag 検証）→ `desktop`（matrix: windows/ubuntu, tauri-action）→ `android`（キーストア復元 + APK ビルド + 添付）→ `publish-release`（draft 公開）の4ジョブ構成。既存 `ci.yml`（lint/test）は変更しない。

**Tech Stack:** GitHub Actions, `tauri-apps/tauri-action@v0`, `actions/github-script`, Tauri v2 CLI, Android Gradle（既存署名構成）, minisign（Tauri updater 署名）。

## Global Constraints

- 対象プラットフォーム: Windows / Linux / Android（macOS/iOS は対象外）。
- 配布元: public な GitHub Releases。更新エンドポイントは `https://github.com/natsuyasai/multi-column-x/releases/latest/download/latest.json`。
- バージョンの真実は `src-tauri/tauri.conf.json` の `version`。タグは `v{version}`。
- Tauri updater 署名は必須（minisign 公開鍵を config、秘密鍵/PW を Secrets）。
- Android 署名は既存 `upload-keystore.jks`（alias `upload`、store/key 同一 PW）を継続使用。鍵を変更しない。
- OS コード署名なし。
- 既存 `ci.yml` は変更しない。
- 秘密情報（鍵・PW・keystore）は絶対にコミットしない。`keystore.properties` / `*.jks` は gitignore 済みを維持。

## 前提（ユーザー作業 — 実装と並行で準備）

これらが揃わないと `desktop` / `android` ジョブの**実行**は成功しないが、ワークフロー定義・構文検証・ローカルビルド確認は先行できる。

- リポジトリを public 化。
- `tauri signer generate -w ./.tauri-signing.key`（または `npx tauri signer generate`）で鍵生成 →
  公開鍵を Task 3 で config に記入、秘密鍵/PW を Secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` に登録。
- Android Secrets 登録: `ANDROID_KEYSTORE_BASE64`（`base64 -w0 upload-keystore.jks`）, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`。

---

## File Structure

- Create: `.github/workflows/release.yml` — リリースワークフロー本体。
- Modify: `src-tauri/tauri.conf.json` — updater プラグイン設定（pubkey/endpoints）+ updater 成果物有効化。
- Modify: `src-tauri/Cargo.toml` — `tauri-plugin-updater` 依存追加（desktop のみ）。
- Modify: `src-tauri/capabilities/default.json`（or 該当 capability）— updater 権限（最小）。
- 参照のみ（変更なし）: `.github/workflows/ci.yml`, `src-tauri/gen/android/app/build.gradle.kts`, `src-tauri/gen/android/keystore.properties`。

> 注: updater の**フロント実装**はサブプロジェクト2で行う。本計画では「ビルド時に署名付き `latest.json` を生成・添付できる状態」までを作る（プラグイン依存 + config）。

---

### Task 1: ブランチ作成と作業準備

**Files:** なし（git 操作のみ）

- [ ] **Step 1: 新規ブランチを作成**

```bash
git checkout main
git pull --ff-only 2>/dev/null || true
git checkout -b feat/release-cicd
```

- [ ] **Step 2: ローカルで現状のデスクトップビルドが通ることを確認（任意・環境依存）**

Run: `npm ci`
Expected: 依存インストール成功（後続ジョブの前提確認。Windows ローカルなら `npm run tauri:build` で NSIS 生成可）。

---

### Task 2: updater プラグイン依存の追加（Rust）

**Files:**

- Modify: `src-tauri/Cargo.toml`

**Interfaces:**

- Produces: `tauri-plugin-updater` クレートが利用可能（desktop ターゲット）。フロント実装はサブプロジェクト2で使用。

- [ ] **Step 1: Cargo.toml に updater 依存を追加（desktop 限定）**

`src-tauri/Cargo.toml` の `[dependencies]` 直後に、デスクトップ専用依存ブロックを追加する（Android では updater を使わないため `cfg(not(target_os = "android"))` で限定）。

```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-updater = "2"
```

- [ ] **Step 2: lib.rs でプラグインを登録（desktop 限定）**

`src-tauri/src/lib.rs`（または `main.rs`）の Builder にデスクトップ限定でプラグインを登録する。既存の `.plugin(...)` 連鎖の近くに追記。

```rust
        // デスクトップのみ自動更新プラグインを登録（Android は APK 自己更新を別実装）
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_updater::UpdaterExt as _;
                let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build());
            }
            Ok(())
        })
```

> 既に `.setup(...)` がある場合はその中に `#[cfg(desktop)]` ブロックを統合する（二重 setup を避ける）。`lib.rs` の現状に合わせて配置すること。

- [ ] **Step 3: ビルド確認**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS（warning は `-D warnings` 相当で出さない）。

- [ ] **Step 4: フォーマット**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml`
Expected: 差分整形のみ。

- [ ] **Step 5: コミット**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/Cargo.lock
git commit -m "feat: デスクトップ向けtauri-plugin-updaterを追加"
```

---

### Task 3: tauri.conf.json に updater 設定を追加

**Files:**

- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**

- Produces: ビルド時に updater 成果物（`*.sig`）と `latest.json` を tauri-action が生成・署名する設定。

- [ ] **Step 1: plugins.updater を追加**

`src-tauri/tauri.conf.json` の `"plugins": {}` を以下に置き換える。`<PUBKEY>` は前提で生成した minisign 公開鍵（`tauri signer generate` 出力の `Public key:` 行、`dW...` で始まる base64）を貼る。

```jsonc
  "plugins": {
    "updater": {
      "pubkey": "<PUBKEY>",
      "endpoints": [
        "https://github.com/natsuyasai/multi-column-x/releases/latest/download/latest.json"
      ]
    }
  },
```

- [ ] **Step 2: bundle に updater アーティファクトとデスクトップ targets を明示**

`"bundle"` ブロックを以下に更新（既存の `android.minSdkVersion` は維持）。`createUpdaterArtifacts: true` で `.sig` を生成する。

```jsonc
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true,
    "targets": ["nsis", "appimage", "deb"],
    "android": {
      "minSdkVersion": 24
    }
  }
```

> `targets` を全体指定すると各 OS で対応形式のみ生成される（Windows=nsis, Linux=appimage/deb）。Android はこの targets の影響を受けない。

- [ ] **Step 3: JSON 構文確認**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'));console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: コミット**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: updaterのpubkey/endpointとupdater成果物生成を設定"
```

---

### Task 4: updater capability 権限の付与

**Files:**

- Modify: `src-tauri/capabilities/default.json`（実ファイル名は `ls src-tauri/capabilities` で確認）

**Interfaces:**

- Consumes: Task 2 のプラグイン。
- Produces: フロント（サブプロジェクト2）が `check`/`download`/`install` を呼べる権限。

- [ ] **Step 1: capability に updater 権限を追加**

`src-tauri/capabilities/default.json` の `"permissions"` 配列に以下を追加（desktop 限定で問題ないが、配列追加で可）。

```jsonc
    "updater:default",
    "process:default"
```

> `process:default` は更新後の relaunch 用（`tauri-plugin-process`）。process プラグイン依存はサブプロジェクト2で追加するため、本タスクでは updater 権限のみ先行追加でも可。capability の plugin 名は導入後に解決される。

- [ ] **Step 2: JSON 構文確認**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/capabilities/default.json','utf8'));console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: コミット**

```bash
git add src-tauri/capabilities/default.json
git commit -m "feat: updater capabilityの権限を追加"
```

---

### Task 5: リリースワークフロー `release.yml` を作成（desktop まで）

**Files:**

- Create: `.github/workflows/release.yml`

**Interfaces:**

- Produces: `create-release`（`release_id`, `version` outputs）、`desktop`（成果物 + latest.json 添付）。

- [ ] **Step 1: ワークフローの骨格（create-release + desktop）を作成**

`.github/workflows/release.yml` を新規作成。

```yaml
name: Release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  create-release:
    runs-on: ubuntu-latest
    outputs:
      release_id: ${{ steps.create.outputs.result }}
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - name: Read version from tauri.conf.json
        id: version
        run: echo "version=$(jq -r .version src-tauri/tauri.conf.json)" >> "$GITHUB_OUTPUT"
      - name: Verify tag matches version
        if: startsWith(github.ref, 'refs/tags/')
        run: |
          tag="${GITHUB_REF_NAME#v}"
          ver="${{ steps.version.outputs.version }}"
          if [ "$tag" != "$ver" ]; then
            echo "tag ($tag) != tauri.conf.json version ($ver)"; exit 1
          fi
      - name: Create draft release
        id: create
        uses: actions/github-script@v7
        with:
          result-encoding: string
          script: |
            const tag = `v${{ steps.version.outputs.version }}`;
            const existing = await github.rest.repos.listReleases({ owner: context.repo.owner, repo: context.repo.repo });
            const found = existing.data.find(r => r.tag_name === tag);
            if (found) return String(found.id);
            const { data } = await github.rest.repos.createRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              tag_name: tag,
              name: `MultiColumnX ${tag}`,
              draft: true,
              prerelease: false,
            });
            return String(data.id);

  desktop:
    needs: create-release
    strategy:
      fail-fast: false
      matrix:
        platform: [windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          releaseId: ${{ needs.create-release.outputs.release_id }}
      - name: Upload CI artifacts
        uses: actions/upload-artifact@v4
        with:
          name: desktop-${{ matrix.platform }}
          path: |
            src-tauri/target/release/bundle/**/*
          if-no-files-found: warn
```

- [ ] **Step 2: ワークフロー構文を検証**

Run（actionlint が無ければインストール手順を案内）:

```bash
which actionlint || (curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash | bash)
./actionlint .github/workflows/release.yml 2>&1 | head -40 || actionlint .github/workflows/release.yml
```

Expected: エラー無し（exit 0）。

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/release.yml
git commit -m "feat: リリースワークフロー(create-release/desktop)を追加"
```

---

### Task 6: Android ビルドジョブを追加

**Files:**

- Modify: `.github/workflows/release.yml`

**Interfaces:**

- Consumes: `create-release.outputs.release_id`, `create-release.outputs.version`。
- Produces: 署名済み universal APK を Release に添付。

- [ ] **Step 1: android ジョブを追記**

`release.yml` の `jobs:` に以下を追加（`desktop` と同階層）。

```yaml
android:
  needs: create-release
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm
    - uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: "17"
    - uses: android-actions/setup-android@v3
    - name: Install Android NDK
      run: sdkmanager "ndk;26.1.10909125"
    - name: Set NDK_HOME
      run: echo "NDK_HOME=$ANDROID_SDK_ROOT/ndk/26.1.10909125" >> "$GITHUB_ENV"
    - uses: dtolnay/rust-toolchain@stable
      with:
        targets: aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android
    - uses: Swatinem/rust-cache@v2
      with:
        workspaces: src-tauri
    - run: npm ci
    - name: Restore Android keystore
      env:
        ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
        ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
        ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
      run: |
        echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/upload-keystore.jks"
        cat > src-tauri/gen/android/keystore.properties <<EOF
        password=$ANDROID_KEYSTORE_PASSWORD
        keyAlias=$ANDROID_KEY_ALIAS
        storeFile=$RUNNER_TEMP/upload-keystore.jks
        EOF
    - name: Build signed APK
      run: npm run build:inject && npx tauri android build --apk
    - name: Upload APK to release
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        VERSION: ${{ needs.create-release.outputs.version }}
      run: |
        apk=$(find src-tauri/gen/android/app/build/outputs/apk -name "*universal*release*.apk" | head -n1)
        if [ -z "$apk" ]; then echo "APK not found"; find src-tauri/gen/android -name "*.apk"; exit 1; fi
        cp "$apk" "MultiColumnX_${VERSION}_universal.apk"
        gh release upload "v${VERSION}" "MultiColumnX_${VERSION}_universal.apk" --clobber
    - name: Upload CI artifact
      uses: actions/upload-artifact@v4
      with:
        name: android-apk
        path: src-tauri/gen/android/app/build/outputs/apk/**/*release*.apk
        if-no-files-found: warn
```

> APK のパスとファイル名は `find` で動的解決する（tauri/AGP のバージョンで階層が変わるため）。`gh release upload` は draft Release にもタグ指定で添付できる。

- [ ] **Step 2: 構文検証**

Run: `actionlint .github/workflows/release.yml`
Expected: エラー無し。

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/release.yml
git commit -m "feat: Android APKの署名ビルド&添付ジョブを追加"
```

---

### Task 7: publish-release ジョブを追加（draft 公開）

**Files:**

- Modify: `.github/workflows/release.yml`

**Interfaces:**

- Consumes: `create-release.outputs.release_id`, `desktop`, `android` の成功。

- [ ] **Step 1: publish ジョブを追記**

```yaml
publish-release:
  needs: [create-release, desktop, android]
  runs-on: ubuntu-latest
  steps:
    - uses: actions/github-script@v7
      with:
        script: |
          await github.rest.repos.updateRelease({
            owner: context.repo.owner,
            repo: context.repo.repo,
            release_id: ${{ needs.create-release.outputs.release_id }},
            draft: false,
          });
```

- [ ] **Step 2: 構文検証**

Run: `actionlint .github/workflows/release.yml`
Expected: エラー無し。

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/release.yml
git commit -m "feat: 全ジョブ成功後にdraftリリースを公開する"
```

---

### Task 8: 動作検証（ユーザー Secrets 投入後）

**Files:** なし（運用検証）

- [ ] **Step 1: 前提が揃っているか確認**

- リポジトリ public 化済み
- Secrets 4種（TAURI_SIGNING_PRIVATE_KEY / \_PASSWORD / ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS）登録済み
- `tauri.conf.json` の `pubkey` が実鍵に置換済み

- [ ] **Step 2: PR をマージし、検証用タグを push**

```bash
git checkout main && git merge --no-ff feat/release-cicd
# バージョンを上げる場合は tauri.conf.json と package.json の version を一致させてから
git tag v0.1.0
git push origin main --tags
```

- [ ] **Step 3: Actions の結果を確認**

Run: `gh run watch` もしくは GitHub の Actions タブ
Expected: `create-release` → `desktop`(win/linux) / `android` → `publish-release` が全て成功。

- [ ] **Step 4: Release 成果物を確認**

確認項目:

- NSIS `.exe`（+ `.sig`）、AppImage（+ `.sig`）、deb、`latest.json`、universal APK が添付されている
- `latest.json` に `windows-x86_64` と `linux-x86_64` の両プラットフォームが含まれる（matrix マージ確認）
- Release が draft でなく公開されている

> `latest.json` に片方のプラットフォームしか入らない場合は、tauri-action の updater json マージ挙動の問題。対処として「desktop ジョブを直列化（windows→linux で同一 latest.json に追記）」または「各ジョブで個別 latest.json を生成し統合ステップでマージ」を plan の改訂として追加する。

---

## Self-Review（spec 突合）

- §3.1 既存 CI 維持 → 変更なし（OK）。
- §3.2 create-release/desktop(matrix)/android/publish → Task 5/6/7（OK）。
- §3.2 CI アーティファクト保持 → 各ジョブ `upload-artifact`（OK）。
- §3.3 updater 署名鍵 → Task 3 pubkey + Secrets（前提節 + Task 8）（OK）。
- §3.4 Android 署名（既存鍵流用）→ Task 6 keystore 復元（OK）。
- §4.1 updater プラグイン/config → Task 2/3/4（フロント実装はサブプロジェクト2）（OK）。
- §7 version/tag 一致検証 → Task 5 Step1（OK）。
- §11 latest.json matrix マージ懸念 → Task 8 Step4 に検証と対処方針（OK）。

未確定プレースホルダ: `<PUBKEY>`（鍵生成後に記入。前提節に手順あり）、NDK バージョン（`26.1.10909125` は要確認・調整可）。

# Android アプリ内APK自己更新 実装計画（サブプロジェクト3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Android で GitHub Releases の最新版を検出し、共通の更新ポップアップ（SP2）で「更新する」を選ぶと APK をダウンロードして OS のインストーラを起動する自己更新を実装する。

**Architecture:** JS の `createMobileUpdater()` が GitHub Releases API でバージョン比較し、`install()` で Tauri コマンド `install_apk_update(url)` を呼ぶ。Rust（android_bridge）が JNI で `MainActivity.downloadAndInstallApk(url)` を呼び、Kotlin が APK を DL して `FileProvider` + `ACTION_VIEW` でインストーラを起動する。

**Tech Stack:** React/Vitest, `@tauri-apps/api/app`(getVersion)/`core`(invoke), Rust JNI(jni 0.21), Kotlin(HttpURLConnection, FileProvider, REQUEST_INSTALL_PACKAGES)。

## Global Constraints

- 既存 FileProvider（authority `${applicationId}.fileprovider`, `@xml/file_paths`）を利用。
- JNI で文字列指定して呼ぶ MainActivity メソッドは **proguard keep ルール必須**（CLAUDE.md）。
- Android 単体テストは `:app:testUniversalDebugUnitTest`。テスト名は日本語。
- リポジトリ: `natsuyasai/multi-column-x`。APK アセット名は `MultiColumnX_{version}_universal.apk`。
- desktop の更新挙動（SP2）は変更しない。`install_apk_update` は android 以外ではエラー。

---

## File Structure

- Create: `src/lib/version.ts` + test — `isNewerVersion(latest, current)`。
- Create: `src/lib/githubRelease.ts` + test — `parseLatestRelease(json)`、`fetchLatestRelease()`。
- Modify: `src/services/updater.ts` + test — mobile 実装を実装に差し替え。
- Modify: `src/constants/ipc.ts` — GitHub repo 定数（任意）。
- Create: `src-tauri/src/commands/update.rs` — `install_apk_update` コマンド。
- Modify: `src-tauri/src/commands/mod.rs`、`src-tauri/src/lib.rs` — コマンド登録。
- Modify: `src-tauri/src/android_bridge.rs` — `download_and_install_apk(url)`。
- Modify: `src-tauri/gen/android/app/src/main/java/.../MainActivity.kt` — `downloadAndInstallApk`。
- Modify: `AndroidManifest.xml` — `REQUEST_INSTALL_PACKAGES`。
- Modify: `res/xml/file_paths.xml` — external-files-path 追加。
- Modify: `app/proguard-rules.pro` — keep ルール追加。

---

### Task 1: isNewerVersion（純粋関数・TDD）

**Files:** Create `src/lib/version.ts`, `src/lib/version.test.ts`

- [ ] Step1 失敗テスト:

```ts
import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./version";

describe("isNewerVersion", () => {
  it("パッチが上なら新しい", () =>
    expect(isNewerVersion("1.2.1", "1.2.0")).toBe(true));
  it("同一なら新しくない", () =>
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false));
  it("古ければ新しくない", () =>
    expect(isNewerVersion("1.1.0", "1.2.0")).toBe(false));
  it("数値比較する(10>9)", () =>
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true));
  it("vプレフィックスを無視する", () =>
    expect(isNewerVersion("v1.2.1", "1.2.0")).toBe(true));
});
```

- [ ] Step2 失敗確認 `npx vitest run src/lib/version.test.ts`
- [ ] Step3 実装:

```ts
function parse(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

/** latest が current より新しいバージョンか（数値ドット比較）。 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
```

- [ ] Step4 成功確認 / Step5 コミット `feat: バージョン比較(isNewerVersion)を追加`

---

### Task 2: GitHub Release パース（TDD）

**Files:** Create `src/lib/githubRelease.ts`, `src/lib/githubRelease.test.ts`

**Interfaces:** `interface LatestRelease { version: string; notes?: string; apkUrl: string }`、`parseLatestRelease(json: unknown): LatestRelease | null`、`fetchLatestRelease(): Promise<LatestRelease | null>`

- [ ] Step1 失敗テスト（parse のみ。fetch は薄いラッパのため対象外）:

```ts
import { describe, expect, it } from "vitest";
import { parseLatestRelease } from "./githubRelease";

describe("parseLatestRelease", () => {
  it("tagからvを除いたversionとapk資産URLとbodyを返す", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        { name: "latest.json", browser_download_url: "https://x/latest.json" },
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
        },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      version: "1.2.0",
      notes: "修正",
      apkUrl: "https://x/app.apk",
    });
  });

  it("apk資産が無ければnull", () => {
    expect(parseLatestRelease({ tag_name: "v1.2.0", assets: [] })).toBeNull();
  });

  it("tag_nameが無ければnull", () => {
    expect(parseLatestRelease({ assets: [] })).toBeNull();
  });
});
```

- [ ] Step2 失敗確認
- [ ] Step3 実装:

```ts
export interface LatestRelease {
  version: string;
  notes?: string;
  apkUrl: string;
}

const LATEST_RELEASE_API =
  "https://api.github.com/repos/natsuyasai/multi-column-x/releases/latest";

interface GhAsset {
  name?: string;
  browser_download_url?: string;
}

export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as { tag_name?: string; body?: string; assets?: GhAsset[] };
  if (!obj.tag_name) return null;
  const apk = (obj.assets ?? []).find((a) => a.name?.endsWith(".apk"));
  if (!apk?.browser_download_url) return null;
  return {
    version: obj.tag_name.replace(/^v/i, ""),
    notes: obj.body || undefined,
    apkUrl: apk.browser_download_url,
  };
}

export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return parseLatestRelease(await res.json());
}
```

- [ ] Step4 成功確認 / Step5 コミット `feat: GitHub Releaseパース(parseLatestRelease)を追加`

---

### Task 3: モバイル updater 実装（TDD）

**Files:** Modify `src/services/updater.ts`, `src/services/updater.test.ts`

**Interfaces:** 変更なし（`createUpdater(true)` が実 GitHub チェックに）。

- [ ] Step1 失敗テスト追加（既存 mobile スタブテストを置換）:

```ts
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { fetchLatestRelease } from "../lib/githubRelease";
// 既存の vi.mock 群に追加
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../lib/githubRelease", () => ({ fetchLatestRelease: vi.fn() }));

describe("mobile updater", () => {
  beforeEach(() => vi.clearAllMocks());

  it("新しいバージョンがあればversion/notesを返す", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      notes: "n",
      apkUrl: "u",
    });
    const u = createUpdater(true);
    expect(await u.check()).toEqual({ version: "1.2.0", notes: "n" });
  });

  it("同一バージョンならnull", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.2.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "u",
    });
    const u = createUpdater(true);
    expect(await u.check()).toBeNull();
  });

  it("installはcheckで得たapkUrlでinstall_apk_updateを呼ぶ", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
    });
    const u = createUpdater(true);
    await u.check();
    await u.install();
    expect(invoke).toHaveBeenCalledWith("install_apk_update", {
      url: "https://x/app.apk",
    });
  });
});
```

- [ ] Step2 失敗確認
- [ ] Step3 実装（mobile スタブを置換）:

```ts
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { fetchLatestRelease } from "../lib/githubRelease";
import { isNewerVersion } from "../lib/version";

function createMobileUpdater(): Updater {
  let apkUrl: string | null = null;
  return {
    async check() {
      const current = await getVersion();
      const release = await fetchLatestRelease();
      if (!release || !isNewerVersion(release.version, current)) return null;
      apkUrl = release.apkUrl;
      return { version: release.version, notes: release.notes };
    },
    async install() {
      if (!apkUrl) return;
      await invoke("install_apk_update", { url: apkUrl });
    },
  };
}
```

- [ ] Step4 成功確認（全 updater テスト）/ Step5 コミット `feat: モバイルupdater(GitHub Releaseチェック+APKインストール起動)を実装`

---

### Task 4: Rust コマンド install_apk_update

**Files:** Create `src-tauri/src/commands/update.rs`, Modify `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

- [ ] Step1 `commands/update.rs`:

```rust
//! アプリ更新コマンド（Android: APK 自己更新）。

/// Android で APK をダウンロードして OS のインストーラを起動する。
/// それ以外のプラットフォームでは未対応エラーを返す。
#[tauri::command]
pub async fn install_apk_update(url: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return crate::android_bridge::download_and_install_apk(&url);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = url;
        Err("install_apk_update is only supported on Android".into())
    }
}
```

- [ ] Step2 `commands/mod.rs` に `pub mod update;` を追加（既存の mod 宣言群に合わせる）。
- [ ] Step3 `lib.rs` の `invoke_handler` 配列末尾に `commands::update::install_apk_update,` を追加。
- [ ] Step4 `cargo check --manifest-path src-tauri/Cargo.toml` → PASS、`cargo fmt`。
- [ ] Step5 コミット `feat: install_apk_updateコマンドを追加`

---

### Task 5: android_bridge download_and_install_apk

**Files:** Modify `src-tauri/src/android_bridge.rs`

**Interfaces:** `pub fn download_and_install_apk(url: &str) -> Result<(), String>`

- [ ] Step1 既存 `launch_add_account_activity` 付近に追加:

```rust
/// MainActivity.downloadAndInstallApk(url) 経由で APK を DL してインストーラを起動する。
pub fn download_and_install_apk(url: &str) -> Result<(), String> {
    call_activity_method(|env, activity| {
        let j_url = env.new_string(url).map_err(|e| e.to_string())?;
        env.call_method(
            activity,
            "downloadAndInstallApk",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&*j_url)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}
```

- [ ] Step2 `cargo check`（android ターゲットは CI 側。ホストでは `#[cfg(target_os="android")]` 配下のため未コンパイルだが、関数自体は android 専用にする）。

> 注: この関数は android 専用。ホスト build で未使用警告を避けるため `#[cfg(target_os = "android")]` を付ける。`install_apk_update` から android cfg 下でのみ呼ぶ。

- [ ] Step3 コミット `feat: APK DL/インストール起動のJNIブリッジを追加`

---

### Task 6: Kotlin downloadAndInstallApk + 権限

**Files:** Modify `MainActivity.kt`, `AndroidManifest.xml`, `res/xml/file_paths.xml`, `proguard-rules.pro`

- [ ] Step1 `AndroidManifest.xml` に権限追加（`<uses-permission android:name="android.permission.INTERNET" />` の下）:

```xml
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

- [ ] Step2 `res/xml/file_paths.xml` に external-files-path 追加:

```xml
  <external-files-path name="updates" path="updates" />
```

- [ ] Step3 `MainActivity.kt` に実装（ThreadUtils/既存 import に合わせる）:

```kotlin
  // GitHub からダウンロードした APK でアプリを自己更新する。
  // 提供元不明アプリのインストール許可が無ければ設定画面へ誘導する。
  fun downloadAndInstallApk(url: String) {
    // インストール許可の確認（Android 8.0+）
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
      runOnUiThread {
        try {
          startActivity(
            Intent(
              Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
              Uri.parse("package:$packageName"),
            ),
          )
        } catch (e: Exception) {
          Log.w(TAG, "downloadAndInstallApk: cannot open unknown sources settings: ${e.message}")
        }
      }
      return
    }
    Thread {
      try {
        val dir = File(getExternalFilesDir(null), "updates").apply { mkdirs() }
        val apk = File(dir, "update.apk")
        (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 30000
          readTimeout = 30000
          instanceFollowRedirects = true
        }.inputStream.use { input ->
          apk.outputStream().use { output -> input.copyTo(output) }
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", apk)
        val intent =
          Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        runOnUiThread { startActivity(intent) }
      } catch (e: Exception) {
        Log.e(TAG, "downloadAndInstallApk failed: ${e.message}")
      }
    }.start()
  }
```

必要な import を追加: `android.os.Build`, `android.provider.Settings`, `androidx.core.content.FileProvider`, `java.io.File`(既存), `java.net.HttpURLConnection`, `java.net.URL`。

- [ ] Step4 `proguard-rules.pro` の MainActivity keep ルールに追加:

```
    public void downloadAndInstallApk(java.lang.String);
```

- [ ] Step5 ktlint & コンパイル確認: `cd src-tauri/gen/android && ./gradlew.bat ktlintFormat ktlintCheck :app:compileUniversalDebugKotlin`
- [ ] Step6 コミット `feat: APKダウンロード&インストール起動をMainActivityに実装`

---

### Task 7: 仕上げ・全テスト

- [ ] Step1 `npm test` 全 PASS、`npx tsc --noEmit` OK、`npm run format:ts`。
- [ ] Step2 `cargo check`／`cargo fmt --check`。
- [ ] Step3 Android: `:app:testUniversalDebugUnitTest` PASS、ktlintCheck PASS。
- [ ] Step4 コミット（差分があれば）。

---

## 検証（実機・ユーザー）

- 実機に旧バージョン APK を入れ、新タグを GitHub にリリース → アプリ起動時にポップアップ → 「更新する」で DL → インストーラ起動 → 同一署名のため上書き更新できることを確認。
- 「提供元不明アプリ」許可が必要な初回は設定誘導される。

## Self-Review（spec 突合）

- §5.1 GitHub API でのバージョン比較 → Task 1/2/3（OK）。
- §5.2 APK DL + FileProvider + ACTION_VIEW → Task 5/6（OK）。
- §5.2 JNI ブリッジ + proguard 同期 → Task 5/6 Step4（OK）。
- §5.3 REQUEST_INSTALL_PACKAGES + 未許可時の設定誘導 → Task 6 Step1/3（OK）。
- §6.3 mobile 実装でインターフェース充足 → Task 3（OK）。

未確定: 実機動作（DL/インストーラ）は実機検証が必要。NDK/AGP のパスは CI 側。

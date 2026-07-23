# 実装プラン: 投稿ページカラム + URL遷移ロック

## 目的 / 仕様

- カラム追加ダイアログのページタイプに **「投稿」** を追加する（新 `PageType = "compose"`）。
- 投稿カラムは X の投稿ページ `https://x.com/compose/post` を表示する。
- 投稿カラムで **URL遷移が発生したら即座に元の投稿ページURL（`/compose/post`）へ戻す**（inject スクリプトで History API を監視し、投稿ページ以外へ移動したら `location.assign(COMPOSE_URL)` で戻す）。
- このロック挙動を **カラム個別設定でON/OFF** できる（`ColumnSettings.postPageRedirectEnabled`、デフォルト `true`）。設定パネルには投稿カラムのときだけトグルを表示。
- 対象: desktop + Android 両方（inject スクリプト方式なので一様に動作）。

## 確定した設計判断（メインエージェント承認済み）

- 設定スコープ = カラム個別のみ（グローバルデフォルトは持たない）。
- リダイレクト方式 = `location.assign("https://x.com/compose/post")`（フルリロードで確実に戻す）。SPA内履歴遷移での復元はXの内部ルーターに依存し不安定なため採らない。
- 実DOM検証はこの環境では不可 → jsdom ユニットテスト + Rust テストで契約を担保。実X上の最終確認はユーザーが後日実施。

## 重要な前提知識（現状コード）

- カラムURLは **Rust の純粋関数** `resolve_url()`（`src-tauri/src/commands/webview/column.rs:28`）が `page_type` から生成。TS側ではURLを組み立てない。
- 投稿URL定数は既に `src-tauri/src/commands/webview/compose.rs:21` に `COMPOSE_URL = "https://x.com/compose/post"` として存在。
- inject スクリプトは `src-tauri/src/inject/_src/*.ts` に書き、`npm run build:inject` で `src-tauri/src/inject/*.js` を生成（`.js` は gitignore・直接編集禁止）。`build_init_script`（`src-tauri/src/inject/mod.rs:24`）が `include_str!` で各 `.js` を連結。注入の有無は `InitScriptParams` のフラグで制御する。
- 参考実装: `scroll_pos_restore.ts` が pushState/replaceState/popstate/ポーリングでURL遷移を監視する既存パターン。**これを踏襲する。**
- `ColumnSettings` は TS(`src/types/index.ts`) と Rust(`src-tauri/src/commands/settings.rs`) の二重定義。Rust は各フィールドに `#[serde(rename = "camelCase")]`。契約 fixture は GlobalSettings のみ（ColumnSettings 用 fixture は無い）ので、ColumnSettings への追加は TS/Rust の2箇所同期でよい。

---

## 作業単位（TDDで1単位ずつコミット）

各単位で「テストを書く/更新 → 実装 → グリーン → コミット」。テスト名は日本語。

### 単位1: PageType に "compose" を追加（TS型 + ラベル）

**ファイル: `src/types/index.ts`**

1行目:

```ts
export type PageType = "home" | "notifications" | "search" | "list" | "custom";
```

→

```ts
export type PageType =
  | "home"
  | "notifications"
  | "search"
  | "list"
  | "custom"
  | "compose";
```

`getPageTypeLabel`（184行付近）の switch に case を追加（`case "custom":` の後、`compose` を追加）:

```ts
    case "custom":
      return "カスタム";
    case "compose":
      return "投稿";
```

**テスト**: `src/types/index.test.ts` に「pageTypeがcomposeのときラベルは投稿を返す」を追加。

### 単位2: ColumnSettings に postPageRedirectEnabled を追加（TS + Rust 同期）

**ファイル: `src/types/index.ts`**

`ColumnSettings` interface（13行付近）に追加:

```ts
  desktopNotifyEnabled?: boolean;
  /** 投稿カラムでURL遷移が起きたとき投稿ページへ戻す（投稿カラムのみ有効） */
  postPageRedirectEnabled: boolean;
```

`DEFAULT_COLUMN_SETTINGS`（120行付近）に追加:

```ts
  desktopNotifyEnabled: false,
  postPageRedirectEnabled: true,
```

DEFAULT_COLUMN_SETTINGS 上部のフィールド対応表コメントにも1行追加（`postPageRedirectEnabled | post_page_redirect_enabled | true`）。

**ファイル: `src-tauri/src/commands/settings.rs`**

`ColumnSettings` struct（`desktop_notify_enabled` の後、60行付近）に追加:

```rust
    #[serde(rename = "desktopNotifyEnabled")]
    #[serde(default)]
    pub desktop_notify_enabled: bool,
    #[serde(rename = "postPageRedirectEnabled")]
    #[serde(default = "default_true")]
    pub post_page_redirect_enabled: bool,
}
```

（`default_true` は既存ヘルパー。新規追加不要。）

**注意（落とし穴）**:

- `column.rs` のテストビルダー `column()`（417行付近）は `serde_json::from_str` で一部フィールドのみ指定 → 残りは serde default に委ねている。`post_page_redirect_enabled` は `default_true` があるので **既存テストは壊れない**（追加不要）。
- ColumnSettings に `impl Default` は無い。リテラル構築箇所は grep 済みで無い（`ColumnSettings {` は struct 定義のみ）。

**テスト**: settings.rs のテスト、または既存の serde ラウンドトリップに「postPageRedirectEnabled 未指定時に true になる / 指定を尊重する」テストを追加（既存の default テストのスタイルに合わせる。無ければ最小1件追加）。

### 単位3: Rust resolve_url に compose を追加

**ファイル: `src-tauri/src/commands/webview/column.rs`**

`resolve_url`（28行）の `custom` の後に追加:

```rust
        "custom" => column
            .custom_url
            .clone()
            .unwrap_or_else(|| "https://x.com/home".to_string()),
        "compose" => "https://x.com/compose/post".to_string(),
        _ => "https://x.com/home".to_string(),
```

**テスト**: 同ファイル tests に「resolve_url_compose_returns_compose_post」相当（日本語テスト名可、既存は英語snake_caseなので `resolve_url_composeは投稿ページを返す` の形式で。Rustテスト関数名にASCII大文字禁止に注意）:

```rust
    #[test]
    fn resolve_url_composeは投稿ページurlを返す() {
        assert_eq!(
            resolve_url(&column("compose")),
            "https://x.com/compose/post"
        );
    }
```

### 単位4: inject スクリプト post_page_lock.ts を新規作成

**新規ファイル: `src-tauri/src/inject/_src/post_page_lock.ts`**

`scroll_pos_restore.ts` の監視パターンを踏襲。仕様:

- 定数 `COMPOSE_URL = "https://x.com/compose/post"`、`COMPOSE_PATH = "/compose/post"`。
- `isComposePage()`: `window.location.pathname === COMPOSE_PATH`。
- `enforceLock()`: 投稿ページでなければ `window.location.assign(COMPOSE_URL)` を呼ぶ。**同じ href に対して連続 assign しないガード**（`lastAssignedHref` を保持し、直近に戻した先と同じなら再度呼ばない。実際にはassignで遷移が起きるが、jsdom/多重発火対策として `!isComposePage()` の時のみ呼ぶ + 直近の遷移元記録で二重呼び出しを避ける）。
- pushState/replaceState をラップ + popstate リスナ + `setInterval(500ms)` ポーリングで、URLが投稿ページから離れたら `enforceLock()`。
- IIFE。注入されたら常時有効（有効/無効判定は Rust の注入可否で制御。`scroll_pos_restore.ts` と同じ思想）。

実装（雛形）:

```ts
(function () {
  const COMPOSE_URL = "https://x.com/compose/post";
  const COMPOSE_PATH = "/compose/post";

  function isComposePage(): boolean {
    return window.location.pathname === COMPOSE_PATH;
  }

  function enforceLock(): void {
    if (isComposePage()) return;
    // 投稿ページ以外へ遷移した → 即座に投稿ページへ戻す
    window.location.assign(COMPOSE_URL);
  }

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(history, args);
    enforceLock();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);
    enforceLock();
  };

  window.addEventListener("popstate", () => {
    enforceLock();
  });

  // History API を介さない遷移（meta refresh 等）の保険としてポーリングも行う
  let previousHref = window.location.href;
  setInterval(() => {
    const currentHref = window.location.href;
    if (currentHref !== previousHref) {
      previousHref = currentHref;
      enforceLock();
    }
  }, 500);
})();
```

**新規ファイル: `src-tauri/src/inject/_src/post_page_lock.test.ts`**

`scroll_pos_restore.test.ts` を参考に。ポイント:

- ファイル先頭に `// @vitest-environment-options { "url": "https://x.com/compose/post" }`。
- `beforeAll` で `window.location.assign` を spy 化（jsdom は未実装で "not implemented" を出すため `vi.spyOn(window.location, "assign").mockImplementation(() => {})`）してから `await import("./post_page_lock")`。
- テストケース（日本語名）:
  1. 「投稿ページ以外へpushStateしたら投稿ページへassignで戻す」: `history.pushState({}, "", "/home")` → `assign` が `COMPOSE_URL` で呼ばれる。
  2. 「投稿ページ内のpushStateでは戻さない」: 一旦 assign モックをクリアし `history.pushState({}, "", "/compose/post")`（pathname 不変）→ `assign` 未呼び出し。
  3. 「popstateで投稿ページ外なら戻す」: pathname を `/home` にして `window.dispatchEvent(new PopStateEvent("popstate"))` → `assign` 呼び出し。
- **落とし穴**: jsdom で `window.location.pathname` を直接代入しても効かない場合があるため、URL変更は `history.pushState`/`history.replaceState` 経由で行う（同一オリジン `https://x.com` 内はjsdomが location を更新する）。`assign` は spy なので実遷移は起きない＝pathname はテスト側の pushState が支配する。各テスト冒頭で `history.replaceState({}, "", "/compose/post")` で基準に戻し、`assign` spy を `mockClear()` する。

**ファイル: `vite.inject.config.ts`**

`plainEntries` 配列（10行付近）に `"post_page_lock"` を追加。

### 単位5: build_init_script に post_page_lock を配線

**ファイル: `src-tauri/src/inject/mod.rs`**

`InitScriptParams` struct に追加:

```rust
    pub global_ng_words: &'a [String],
    pub post_page_lock_enabled: bool,
}
```

`build_init_script` 内で include（`notification_header_hide` の近く、条件付き）:

```rust
    let post_page_lock = if params.post_page_lock_enabled {
        include_str!("post_page_lock.js")
    } else {
        ""
    };
```

`format!` の連結（103行付近）に `post_page_lock` を末尾追加（プレースホルダ `{}` を1つ増やし、引数末尾に `post_page_lock` を追加）。

**注意**: `default_params()`（テスト、163行付近）に `post_page_lock_enabled: false,` を追加（コンパイルエラー回避）。

**テスト**: mod.rs tests に2件追加:

- 「post_page_lock_enabledがtrueのとき投稿ロックスクリプトが含まれる」→ `params.post_page_lock_enabled = true; assert!(script.contains("/compose/post"));`
- 「post_page_lock_enabledがfalseのとき含まれない」→ `assert!(!script.contains("compose/post"));`（default_params は false）

### 単位6: build_column_init_script で有効判定を渡す

**ファイル: `src-tauri/src/commands/webview/column.rs`**

`build_column_init_script`（64行）内、`build_init_script(&InitScriptParams { ... })` に追加。判定は「投稿カラム かつ 設定ON」:

```rust
        global_ng_words: &global_ng_words,
        post_page_lock_enabled: column.page_type == "compose"
            && column.settings.post_page_redirect_enabled,
    })
```

**テスト**: 判定は単純なので、`build_column_init_script` 自体はAppHandle依存で単体テスト困難。単位5のmod.rsテストで注入可否は担保済み。ここは追加テスト不要（もし容易なら `resolve_url` 同様の純粋ヘルパーに切り出す案もあるが、over-engineering回避のためインラインでよい）。

### 単位7: AddColumnDialog に「投稿」選択肢を追加

**ファイル: `src/components/AddColumnDialog/AddColumnDialog.tsx`**

ページタイプ select（106行付近）に option 追加:

```tsx
            <option value="custom">カスタムURL</option>
            <option value="compose">投稿</option>
```

`handleSubmit` の column 生成は変更不要（compose は追加入力欄なし。customUrl/searchQuery/listId/homeTabName は既に pageType 条件で undefined になる）。

**テスト**: `AddColumnDialog.test.tsx` に「投稿を選んで追加するとpageTypeがcomposeのカラムが作られる」を追加。既存テストが option 数を assert していないか確認し、していれば更新。

### 単位8: SettingsPanel に投稿ロックのトグルを追加（投稿カラム限定）

**ファイル: `src/components/SettingsPanel/SettingsPanel.tsx`**

投稿カラムのときだけ表示するセクションを追加（既存の checkLabel パターンを踏襲）。`column.pageType === "compose"` で条件表示:

```tsx
{
  column.pageType === "compose" && (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>投稿ページ</h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={settings.postPageRedirectEnabled}
          onChange={(e) =>
            setSettings({
              ...settings,
              postPageRedirectEnabled: e.target.checked,
            })
          }
        />
        他ページへ遷移したら投稿ページに戻す
      </label>
    </section>
  );
}
```

配置場所は「自動更新」セクションの前後どこでもよいが、`<form>` 内・`カラム`セクションの直後が自然。

**テスト**: `SettingsPanel.test.tsx` に「投稿カラムのときトグルが表示され、切替がonApplyに反映される」＋「投稿カラム以外では表示されない」を追加。

### 単位9: TopBar / MobileTabBar の網羅スイッチに compose を追加（型エラー回避 + アイコン）

**ファイル: `src/components/TopBar/TopBar.tsx`**

- `getColumnIcon` の switch（36行）に追加。PencilIcon は既にimport済み:

```tsx
    case "custom":
      return <CustomIcon {...props} />;
    case "compose":
      return <PencilIcon {...props} />;
```

- `getPageLabel` の switch（51行）に追加:

```tsx
    case "custom":
      return "カスタム";
    case "compose":
      return "投稿";
```

**ファイル: `src/components/MobileTabBar/MobileTabBar.tsx`**

- `labels: Record<PageType, string>`（15行）に追加:

```tsx
    custom: "カスタム",
    compose: "投稿",
```

**テスト**: 既存のTopBar/MobileTabBarテストがあれば compose ケースを最小限追加（型網羅が主目的なので必須ではないが、あれば1件ずつ）。

---

## 完了処理（メインエージェントが実行）

各単位コミット後、最後に:

1. `npm run build:inject`（post_page_lock.js 生成 — 必須）
2. `npm run typecheck`
3. `npm run lint`（必要なら `npm run lint:fix`）
4. `npm test`（Vitest unit）
5. `npm run lint:rust`（clippy -D warnings）
6. `cargo test`（`src-tauri` で Rust テスト）
7. プロパティテスト該当（`npm run test:property`）— 今回は純粋関数の追加が resolve_url くらいなので必須ではない。既存が壊れていないことの確認のみ。

全てグリーンを確認してから push。

## 落とし穴チェックリスト

- [ ] `.js`（`src-tauri/src/inject/post_page_lock.js`）を直接編集しない。必ず `build:inject` で生成。gitignore 対象なのでコミットされない点に注意（生成物はコミット不要）。
- [ ] `vite.inject.config.ts` の `plainEntries` に `post_page_lock` を追加し忘れると `.js` が生成されず `include_str!` がビルドエラーになる。
- [ ] `InitScriptParams` にフィールド追加 → mod.rs の `default_params()` と、`build_column_init_script` の呼び出しの両方を更新（片方漏れでコンパイルエラー）。
- [ ] Rust テスト関数名に ASCII 大文字を含めない（`non_snake_case` で clippy がエラー）。日本語部分はOK。
- [ ] TS `PageType` に compose を足したら、網羅 switch（types/index.ts, TopBar×2）と `Record<PageType,...>`（MobileTabBar）を全て埋める。1つでも漏れると typecheck エラー。
- [ ] ColumnSettings は TS と Rust の2箇所を必ず同期。
- [ ] jsdom テストで `window.location.assign` は spy 化してから import すること（未実装エラー抑止 + 呼び出し検証）。

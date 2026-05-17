# tauri_plugin_log stdout ログ出力 設計書

## 概要

`tauri-plugin-log` を使って、Rust バックエンドおよびフロントエンド（TypeScript）の両方からログを stdout に出力できるようにする。

## 現状

- `tauri-plugin-log = "2.8.0"` は Cargo.toml に追加済み
- `lib.rs` にて `.plugin(tauri_plugin_log::Builder::new().build())` は登録済みだが、ターゲット未設定
- `@tauri-apps/plugin-log` npm パッケージは未インストール
- 既存コードに `eprintln!` マクロが使われている箇所がある

## アーキテクチャ

### Rust 側

`lib.rs` の `tauri_plugin_log::Builder` に以下を設定する。

```rust
.plugin(
    tauri_plugin_log::Builder::new()
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Stdout,
        ))
        .max_level(log::LevelFilter::Debug)
        .build()
)
```

既存の `eprintln!` は `log::error!` または `log::warn!` に置き換える（`lib.rs` 内の `save_window_bounds` 関数）。

### フロントエンド側

`@tauri-apps/plugin-log` をインストールし、`src/lib/logger.ts` にラッパーモジュールを作成する。

```ts
// src/lib/logger.ts
export { error, warn, info, debug, trace } from "@tauri-apps/plugin-log";
```

アプリ内では `logger.ts` 経由でログを呼び出す。

## データフロー

```
[Rust コード] → log::info!() → tauri_plugin_log → stdout
[TS コード]   → logger.info() → IPC → tauri_plugin_log → stdout
```

## 変更ファイル一覧

| ファイル               | 変更内容                                         |
| ---------------------- | ------------------------------------------------ |
| `src-tauri/src/lib.rs` | ログターゲット・レベル設定、`eprintln!` 置き換え |
| `package.json`         | `@tauri-apps/plugin-log` 追加                    |
| `src/lib/logger.ts`    | 新規作成（ログラッパー）                         |

## スコープ外

- ファイル出力（stdout のみ）
- ログローテーション
- リリースビルドでのログレベル変更

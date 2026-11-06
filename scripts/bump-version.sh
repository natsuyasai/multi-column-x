#!/usr/bin/env bash
#
# bump-version.sh — バージョン番号を一括更新するスクリプト
#
# git 管理されているバージョン保持ファイルを新しいバージョンへ書き換える。
# Android の tauri.properties は gitignore 済みの生成物（Tauri がビルド時に
# tauri.conf.json から生成する）なので対象外。
#
# 使い方:
#   ./scripts/bump-version.sh <new-version>
#   例: ./scripts/bump-version.sh 0.1.3
#
# 更新対象:
#   - package.json                                  ("version")
#   - src-tauri/tauri.conf.json                     ("version")
#   - src-tauri/Cargo.toml                          ([package] version)
#   - src-tauri/Cargo.lock                          (multicolumnx パッケージの version)

set -euo pipefail

# --- 引数チェック ---------------------------------------------------------
if [ "$#" -ne 1 ]; then
  echo "使い方: $0 <new-version>" >&2
  echo "例:     $0 0.1.3" >&2
  exit 1
fi

NEW_VERSION="$1"

# セマンティックバージョン (x.y.z) のみ許可
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "エラー: バージョンは x.y.z 形式で指定してください (例: 0.1.3)" >&2
  echo "指定値: $NEW_VERSION" >&2
  exit 1
fi

# --- パス解決 -------------------------------------------------------------
# スクリプトの位置からリポジトリルートを特定する
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGE_JSON="$ROOT_DIR/package.json"
TAURI_CONF="$ROOT_DIR/src-tauri/tauri.conf.json"
CARGO_TOML="$ROOT_DIR/src-tauri/Cargo.toml"
CARGO_LOCK="$ROOT_DIR/src-tauri/Cargo.lock"

# 存在チェック
for f in "$PACKAGE_JSON" "$TAURI_CONF" "$CARGO_TOML" "$CARGO_LOCK"; do
  if [ ! -f "$f" ]; then
    echo "エラー: ファイルが見つかりません: $f" >&2
    exit 1
  fi
done

# --- 更新処理 -------------------------------------------------------------
# perl -i で各ファイルを書き換える (GNU/BSD どちらの sed 差異にも依存しない)

# package.json: 先頭の "version" を置換
NEW_VERSION="$NEW_VERSION" perl -0pi -e \
  's/("version":\s*")[^"]*(")/$1$ENV{NEW_VERSION}$2/' "$PACKAGE_JSON"

# tauri.conf.json: 先頭の "version" を置換
NEW_VERSION="$NEW_VERSION" perl -0pi -e \
  's/("version":\s*")[^"]*(")/$1$ENV{NEW_VERSION}$2/' "$TAURI_CONF"

# Cargo.toml: [package] 直下の version 行 (行頭 version = "...") を置換
NEW_VERSION="$NEW_VERSION" perl -pi -e \
  's/^(version = ")[^"]*(")/$1$ENV{NEW_VERSION}$2/ if !$done && /^version = /; $done=1 if /^version = /;' "$CARGO_TOML"

# Cargo.lock: multicolumnx パッケージ直後の version 行のみ置換
NEW_VERSION="$NEW_VERSION" perl -0pi -e \
  's/(name = "multicolumnx"\nversion = ")[^"]*(")/$1$ENV{NEW_VERSION}$2/' "$CARGO_LOCK"

# --- 結果表示 -------------------------------------------------------------
echo "バージョンを $NEW_VERSION に更新しました"
echo "更新ファイル:"
echo "  - package.json"
echo "  - src-tauri/tauri.conf.json"
echo "  - src-tauri/Cargo.toml"
echo "  - src-tauri/Cargo.lock"

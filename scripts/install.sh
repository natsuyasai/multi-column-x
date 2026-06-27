#!/usr/bin/env bash
# install.sh — MultiColumnX Linux インストールスクリプト
#
# 使い方:
#   ./scripts/install.sh             # 最新版をインストール
#   ./scripts/install.sh --uninstall # アンインストール
#
# 動作:
#   インストール: GitHub 最新リリースから AppImage をダウンロードし
#                 ~/.local/bin に配置、Desktop Entry を作成する
#   アンインストール: AppImage・アイコン・Desktop Entry を削除する

set -euo pipefail

readonly APP_NAME="MultiColumnX"
readonly APP_ID="multi-column-x"
readonly REPO="natsuyasai/multi-column-x"
readonly INSTALL_DIR="$HOME/.local/bin"
readonly ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
readonly DESKTOP_DIR="$HOME/.local/share/applications"
readonly APPIMAGE_PATH="$INSTALL_DIR/${APP_NAME}.AppImage"
readonly ICON_PATH="$ICON_DIR/${APP_ID}.png"
readonly DESKTOP_FILE="$DESKTOP_DIR/${APP_ID}.desktop"

# --- ユーティリティ ---------------------------------------------------

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "エラー: $1 が見つかりません。インストールしてください。" >&2
    exit 1
  fi
}

# GitHub API JSON から値を取得（jq 優先、なければ grep/sed フォールバック）
parse_json_field() {
  local json="$1" key="$2"
  if command -v jq &>/dev/null; then
    echo "$json" | jq -r ".$key"
  else
    echo "$json" | grep -o "\"${key}\":\"[^\"]*\"" | grep -o '"[^"]*"$' | tr -d '"'
  fi
}

parse_appimage_url() {
  local json="$1"
  if command -v jq &>/dev/null; then
    echo "$json" | jq -r '.assets[] | select(.name | endswith(".AppImage")) | .browser_download_url' | head -n1
  else
    # .AppImage.tar.gz を除外するため .AppImage" (末尾クォート) で絞り込む
    echo "$json" | grep -o '"browser_download_url":"[^"]*\.AppImage"' | grep -o 'https://[^"]*' | head -n1
  fi
}

# --- アンインストール -------------------------------------------------

uninstall() {
  echo "MultiColumnX をアンインストールします..."

  local removed=0

  if [ -f "$APPIMAGE_PATH" ]; then
    rm -f "$APPIMAGE_PATH"
    echo "  削除: $APPIMAGE_PATH"
    removed=1
  fi
  if [ -f "$ICON_PATH" ]; then
    rm -f "$ICON_PATH"
    echo "  削除: $ICON_PATH"
    removed=1
  fi
  if [ -f "$DESKTOP_FILE" ]; then
    rm -f "$DESKTOP_FILE"
    echo "  削除: $DESKTOP_FILE"
    removed=1
  fi

  if [ "$removed" -eq 0 ]; then
    echo "MultiColumnX はインストールされていません。"
    exit 0
  fi

  if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR"
  fi

  echo "アンインストール完了"
}

# --- アイコン抽出 -----------------------------------------------------

extract_icon() {
  local appimage_path="$1" dest="$2"
  local extract_tmp
  extract_tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$extract_tmp'" RETURN

  echo "AppImage からアイコンを抽出中..."

  # Tauri AppImage には usr/share/icons/hicolor/ 以下に PNG が含まれる
  (cd "$extract_tmp" && "$appimage_path" --appimage-extract 'usr/share/icons' 2>/dev/null) || true

  local icon_src
  # 128x128 を優先、なければ他のサイズ
  icon_src=$(find "$extract_tmp/squashfs-root/usr/share/icons/hicolor" \
    -name "*.png" -path "*/128x128/*" 2>/dev/null | head -n1)
  if [ -z "$icon_src" ]; then
    icon_src=$(find "$extract_tmp/squashfs-root/usr/share/icons/hicolor" \
      -name "*.png" 2>/dev/null | head -n1)
  fi

  if [ -n "$icon_src" ]; then
    cp "$icon_src" "$dest"
    echo "  アイコン: $dest"
  else
    echo "警告: AppImage 内にアイコンが見つかりませんでした。Desktop Entry のアイコンは表示されない場合があります。" >&2
  fi
}

# --- インストール -----------------------------------------------------

install() {
  require_cmd curl

  echo "GitHub から最新バージョンを確認中..."
  local release_info
  release_info=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")

  local appimage_url version
  appimage_url=$(parse_appimage_url "$release_info")
  version=$(parse_json_field "$release_info" "tag_name")

  if [ -z "$appimage_url" ]; then
    echo "エラー: AppImage のダウンロード URL が見つかりません。" >&2
    exit 1
  fi

  echo "バージョン: $version"
  echo "URL: $appimage_url"
  echo ""

  # すでにインストール済みの場合は確認
  if [ -f "$APPIMAGE_PATH" ]; then
    echo "警告: MultiColumnX はすでにインストールされています。上書きしますか？ [y/N]"
    read -r answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      echo "キャンセルしました。"
      exit 0
    fi
  fi

  mkdir -p "$INSTALL_DIR" "$ICON_DIR" "$DESKTOP_DIR"

  # AppImage をダウンロードして実行権限を付与
  echo "AppImage をダウンロード中..."
  curl -fSL --progress-bar -o "$APPIMAGE_PATH" "$appimage_url"
  chmod +x "$APPIMAGE_PATH"
  echo "  配置: $APPIMAGE_PATH"

  # アイコンを AppImage から抽出
  extract_icon "$APPIMAGE_PATH" "$ICON_PATH"

  # Desktop Entry を作成
  echo "Desktop Entry を作成中..."
  cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=MultiColumnX
Comment=TweetDeck スタイルの Twitter/X クライアント
Exec=${APPIMAGE_PATH} %U
Icon=${ICON_PATH}
Terminal=false
Categories=Network;InstantMessaging;
Keywords=twitter;x;tweetdeck;multicolumn;
StartupWMClass=MultiColumnX
EOF
  echo "  デスクトップエントリ: $DESKTOP_FILE"

  # Desktop データベースを更新
  if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR"
  fi

  echo ""
  echo "インストール完了！"
  echo "  バージョン: $version"
  echo ""

  # ~/.local/bin が PATH に含まれていない場合は案内
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo "注意: $INSTALL_DIR が \$PATH に含まれていません。"
    echo "      ~/.bashrc または ~/.profile に以下を追記してください:"
    echo "      export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
  fi

  echo "アプリケーションメニューから MultiColumnX を起動できます。"
}

# --- エントリポイント -------------------------------------------------

case "${1:-}" in
  --uninstall) uninstall ;;
  "")          install ;;
  *)
    echo "使い方: $0 [--uninstall]" >&2
    exit 1
    ;;
esac

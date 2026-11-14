#!/usr/bin/env bash
# strip-appimage-wayland-libs.sh — AppImage に libwayland-* を同梱させないよう、
# Tauri bundler がキャッシュする linuxdeploy の出力プラグインをラッパーに差し替える。
#
# 背景: AppImage 同梱の古い libwayland-{client,cursor,egl,server} がホストの Mesa/EGL と
# 不整合を起こし、Ubuntu 26.04 で `Could not create default EGL display` となり灰色画面になる。
# 署名（updater の .sig）はバンドル時に行われるため、完成後の再パックはできない。
# そこでバンドル工程の内側（AppDir から AppImage を作る直前）で削除する。
#
# 使い方:
#   scripts/strip-appimage-wayland-libs.sh [キャッシュディレクトリ(既定: ~/.cache/tauri)]
#
# 動作:
#   1. キャッシュに出力プラグインが無ければ bundler と同じ URL からダウンロードする
#   2. linuxdeploy-plugin-appimage.AppImage を .real/ サブディレクトリへ退避（既に退避済みなら何もしない＝冪等）
#      ※ キャッシュ直下に退避してはいけない。linuxdeploy は直下の linuxdeploy-plugin-* を
#        正規表現で名前 (appimage) に解決するため、`*.AppImage.real` も同名プラグインとして
#        重複登録され、どちらが使われるかがディレクトリ走査順で変わる（CI で不定に失敗した）
#   3. 同名のラッパースクリプトを置く。ラッパーは linuxdeploy が渡す `--appdir <dir>`
#      （無ければ環境変数 APPDIR）配下の usr/lib/libwayland-* を削除して実体へ exec する
#
# 環境変数: STRIP_WAYLAND_SKIP_DOWNLOAD=1 でダウンロードを行わない（テスト用）

set -euo pipefail

CACHE_DIR="${1:-${XDG_CACHE_HOME:-$HOME/.cache}/tauri}"
PLUGIN="linuxdeploy-plugin-appimage.AppImage"
REAL_DIR="${CACHE_DIR}/.real"
REAL="${REAL_DIR}/${PLUGIN}"
LEGACY_REAL="${CACHE_DIR}/${PLUGIN}.real"
PLUGIN_URL="https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage"

mkdir -p "$CACHE_DIR"

# bundler は存在しないファイルだけを（自身と同じ URL から）取得するため、差し替え対象の
# 出力プラグインだけ先に取得すればよい。他の linuxdeploy 一式は bundler が必要に応じて取得する。
if [ "${STRIP_WAYLAND_SKIP_DOWNLOAD:-0}" != "1" ] \
  && [ ! -e "${CACHE_DIR}/${PLUGIN}" ] && [ ! -e "$REAL" ] && [ ! -e "$LEGACY_REAL" ]; then
  echo "== ダウンロード: ${PLUGIN}"
  curl -fsSL --retry 3 -o "${CACHE_DIR}/${PLUGIN}" "$PLUGIN_URL"
  chmod +x "${CACHE_DIR}/${PLUGIN}"
fi

mkdir -p "$REAL_DIR"
# 旧方式（直下の .AppImage.real）からの移行
if [ -e "$LEGACY_REAL" ] && [ ! -e "$REAL" ]; then
  mv "$LEGACY_REAL" "$REAL"
fi
rm -f "$LEGACY_REAL"

if [ ! -e "$REAL" ]; then
  if [ ! -e "${CACHE_DIR}/${PLUGIN}" ]; then
    echo "エラー: ${CACHE_DIR}/${PLUGIN} がありません。" >&2
    exit 1
  fi
  mv "${CACHE_DIR}/${PLUGIN}" "$REAL"
fi

cat >"${CACHE_DIR}/${PLUGIN}" <<'WRAPPER'
#!/usr/bin/env bash
# strip-appimage-wayland-libs.sh が生成したラッパー。AppImage 化の直前に libwayland-* を除く。
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL="${HERE}/.real/linuxdeploy-plugin-appimage.AppImage"
# linuxdeploy は本番呼び出しの前に --plugin-type / --plugin-api-version で問い合わせる。
# このとき APPDIR は linuxdeploy 自身の展開先を指し得るので、何も削らず実体へ渡す。
case "${1:-}" in
  --plugin-*) exec "$REAL" "$@" ;;
esac
APPDIR_ARG="${APPDIR:-}"
prev=""
for a in "$@"; do
  case "$a" in
    --appdir=*) APPDIR_ARG="${a#--appdir=}" ;;
    *) [ "$prev" = "--appdir" ] && APPDIR_ARG="$a" ;;
  esac
  prev="$a"
done
if [ -z "$APPDIR_ARG" ] || [ ! -d "$APPDIR_ARG" ]; then
  echo "strip-wayland: AppDir を特定できません (APPDIR='${APPDIR_ARG}')" >&2
  exit 1
fi
find "$APPDIR_ARG/usr/lib" -maxdepth 1 -name 'libwayland-*' -print -delete >&2 || true
exec "$REAL" "$@"
WRAPPER
chmod +x "${CACHE_DIR}/${PLUGIN}"
echo "== ラッパーを設置しました: ${CACHE_DIR}/${PLUGIN}"

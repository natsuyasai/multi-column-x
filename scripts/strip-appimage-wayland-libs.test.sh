#!/usr/bin/env bash
#
# strip-appimage-wayland-libs.test.sh — strip-appimage-wayland-libs.sh のテスト
#
# 実行: ./scripts/strip-appimage-wayland-libs.test.sh
#
# 一時ディレクトリのキャッシュにダミーの出力プラグイン（実体）を置いてスクリプトを適用し、
# 生成されたラッパーが libwayland-* を消して実体を呼ぶことを検証する。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_SCRIPT="$SCRIPT_DIR/strip-appimage-wayland-libs.sh"
export STRIP_WAYLAND_SKIP_DOWNLOAD=1

PASS=0
FAIL=0
ok() { echo "  OK: $1"; PASS=$((PASS + 1)); }
ng() { echo "  NG: $1"; FAIL=$((FAIL + 1)); }

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

CACHE="$SANDBOX/cache"
mkdir -p "$CACHE"
PLUGIN="$CACHE/linuxdeploy-plugin-appimage.AppImage"
# ダミー実体: 受け取った引数と、呼び出し時点で libwayland が残っているかを記録する
cat >"$PLUGIN" <<DUMMY
#!/usr/bin/env bash
echo "\$*" >"$SANDBOX/real-args.txt"
ls "\${APPDIR:-\${2:-}}/usr/lib" >"$SANDBOX/real-libs.txt" 2>/dev/null || true
DUMMY
chmod +x "$PLUGIN"

make_appdir() {
  rm -rf "$1"
  mkdir -p "$1/usr/lib"
  touch "$1/usr/lib/libwayland-client.so.0" "$1/usr/lib/libwayland-cursor.so.0" \
    "$1/usr/lib/libwayland-egl.so.1" "$1/usr/lib/libwayland-server.so.0" \
    "$1/usr/lib/libgtk-3.so.0"
}

echo "[テスト] ラッパー設置"
bash "$TARGET_SCRIPT" "$CACHE" >/dev/null
[ -f "$CACHE/linuxdeploy-plugin-appimage.AppImage.real" ] && ok "実体が .real へ退避される" || ng "実体が退避されない"
head -n1 "$PLUGIN" | grep -q bash && ok "同名のラッパースクリプトが置かれる" || ng "ラッパーが置かれない"

echo "[テスト] 冪等: 2 回目でも実体を上書きしない"
bash "$TARGET_SCRIPT" "$CACHE" >/dev/null
grep -q 'real-args' "$CACHE/linuxdeploy-plugin-appimage.AppImage.real" && ok "2 回実行しても .real は元の実体のまま" || ng "2 回目で .real が壊れた"

echo "[テスト] --appdir <dir> 形式: libwayland を消して実体を呼ぶ"
A="$SANDBOX/AppDir1"; make_appdir "$A"
"$PLUGIN" --appdir "$A" >/dev/null 2>&1
if ls "$A"/usr/lib/libwayland-* >/dev/null 2>&1; then ng "libwayland-* が残っている"; else ok "libwayland-* が削除される"; fi
[ -f "$A/usr/lib/libgtk-3.so.0" ] && ok "libwayland 以外は残る" || ng "無関係なライブラリまで消えた"
grep -qF -- "--appdir $A" "$SANDBOX/real-args.txt" && ok "実体へ引数がそのまま渡る" || ng "実体へ引数が渡らない"
grep -q 'libwayland' "$SANDBOX/real-libs.txt" && ng "実体呼び出し時点で libwayland が残っている" || ok "実体呼び出し前に削除済み"

echo "[テスト] --appdir=<dir> 形式"
A="$SANDBOX/AppDir2"; make_appdir "$A"
"$PLUGIN" "--appdir=$A" >/dev/null 2>&1
ls "$A"/usr/lib/libwayland-* >/dev/null 2>&1 && ng "libwayland-* が残っている" || ok "libwayland-* が削除される"

echo "[テスト] 環境変数 APPDIR 形式"
A="$SANDBOX/AppDir3"; make_appdir "$A"
APPDIR="$A" "$PLUGIN" >/dev/null 2>&1
ls "$A"/usr/lib/libwayland-* >/dev/null 2>&1 && ng "libwayland-* が残っている" || ok "libwayland-* が削除される"

echo "[テスト] AppDir を特定できなければ失敗する"
if (unset APPDIR; "$PLUGIN" >/dev/null 2>&1); then ng "AppDir 不明でも成功した"; else ok "AppDir 不明は失敗する"; fi

echo "[テスト] linuxdeploy の問い合わせ (--plugin-type) では何も削らず実体へ渡す"
A="$SANDBOX/AppDir4"; make_appdir "$A"
APPDIR="$A" "$PLUGIN" --plugin-type >/dev/null 2>&1
ls "$A"/usr/lib/libwayland-* >/dev/null 2>&1 && ok "問い合わせでは削除しない" || ng "問い合わせで削除された"
grep -qF -- "--plugin-type" "$SANDBOX/real-args.txt" && ok "問い合わせ引数が実体へ渡る" || ng "問い合わせ引数が渡らない"

echo ""
echo "結果: $PASS 件成功 / $FAIL 件失敗"
[ "$FAIL" -eq 0 ]

#!/usr/bin/env bash
# verify-appimage-media.sh — 生成した AppImage の動画再生まわりの同梱内容を検査する。
#
# 使い方:
#   scripts/verify-appimage-media.sh <AppImage> <libopenh264.so.7 を含むディレクトリ>
#
# 第 2 引数は Cisco 配布物（実運用ではダウンロード先）の代わりに検査で使う
# libopenh264.so.7 の置き場。ディレクトリ中の libopenh264.so.7 だけを一時ディレクトリへ
# 複製して使う（ホストの lib ディレクトリを LD_LIBRARY_PATH に直接入れないため）。
#
# 検査:
#   A  libopenh264* と libva*.so* が AppImage に含まれない
#   B  h264parse(videoparsersbad) / codecparsers / openh264・va グルーが含まれる
#   C  同梱環境のみで H.264 + AAC の動画を最後までデコードできる (Got EOS)
#   D  オプションプラグインの rpath が usr/lib の同梱ライブラリを解決する

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "使い方: $0 <AppImage> <libopenh264.so.7 を含むディレクトリ>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/h264-high-aac.mp4"
APPIMAGE_PATH="$(realpath "$1")"
OPENH264_SRC_DIR="$(realpath "$2")"

for cmd in gst-launch-1.0 ldd find timeout; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "エラー: ${cmd} が見つかりません。" >&2
    exit 2
  fi
done
if [ ! -f "$APPIMAGE_PATH" ]; then
  echo "エラー: AppImage が見つかりません: ${APPIMAGE_PATH}" >&2
  exit 2
fi
if [ ! -f "$FIXTURE" ]; then
  echo "エラー: 検査用動画が見つかりません: ${FIXTURE}" >&2
  exit 2
fi
if [ ! -f "${OPENH264_SRC_DIR}/libopenh264.so.7" ]; then
  echo "エラー: ${OPENH264_SRC_DIR}/libopenh264.so.7 が見つかりません。" >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILED=0
fail() {
  echo "NG: $*" >&2
  FAILED=1
}

echo "== AppImage を展開します: ${APPIMAGE_PATH}"
(cd "$TMP" && "$APPIMAGE_PATH" --appimage-extract >/dev/null)
R="${TMP}/squashfs-root"
if [ ! -d "$R" ]; then
  echo "エラー: AppImage の展開に失敗しました。" >&2
  exit 1
fi

OPTIONAL_DIR="${R}/usr/share/multicolumnx/gst-optional"

echo "== 検査 A: libopenh264 / libva を同梱していないこと"
FOUND_OPENH264="$(find "$R" -name 'libopenh264*')"
if [ -n "$FOUND_OPENH264" ]; then
  fail "libopenh264 が AppImage に含まれています（Cisco 配布物以外の H.264 デコーダ本体は同梱不可）:"
  echo "$FOUND_OPENH264" >&2
fi
FOUND_LIBVA="$(find "$R" -name 'libva*.so*')"
if [ -n "$FOUND_LIBVA" ]; then
  fail "libva が AppImage に含まれています（ホストの libva を使う）:"
  echo "$FOUND_LIBVA" >&2
fi

echo "== 検査 B: 必須ファイルが含まれていること"
for rel in \
  usr/lib/gstreamer-1.0/libgstvideoparsersbad.so \
  usr/lib/libgstcodecparsers-1.0.so.0 \
  usr/share/multicolumnx/gst-optional/plugins/libgstopenh264.so \
  usr/share/multicolumnx/gst-optional/plugins/libgstva.so; do
  if [ ! -e "${R}/${rel}" ]; then
    fail "AppImage に ${rel} が含まれていません。"
  fi
done

echo "== 検査 C: 同梱環境のみで H.264 + AAC 動画をデコードできること"
mkdir -p "${TMP}/openh264"
cp -L "${OPENH264_SRC_DIR}/libopenh264.so.7" "${TMP}/openh264/"
SCANNER="$(find "$R/usr/lib" -name gst-plugin-scanner -type f | head -n1)"
if [ -z "$SCANNER" ]; then
  fail "AppImage に gst-plugin-scanner が含まれていません。"
else
  DECODE_LOG="${TMP}/decode.log"
  set +e
  env LD_LIBRARY_PATH="${TMP}/openh264:${R}/usr/lib" \
    GST_PLUGIN_SYSTEM_PATH_1_0="${R}/usr/lib/gstreamer-1.0" \
    GST_PLUGIN_PATH_1_0="${R}/usr/lib/gstreamer-1.0:${OPTIONAL_DIR}/plugins" \
    GST_PLUGIN_SCANNER_1_0="$SCANNER" \
    GST_REGISTRY_1_0="${TMP}/registry.bin" \
    GST_PLUGIN_FEATURE_RANK="vah264dec:NONE" \
    timeout 30 gst-launch-1.0 filesrc location="$FIXTURE" \
    ! decodebin3 name=d d. ! queue ! fakesink d. ! queue ! fakesink \
    >"$DECODE_LOG" 2>&1
  DECODE_STATUS=$?
  set -e
  if [ "$DECODE_STATUS" -ne 0 ] || ! grep -q 'Got EOS' "$DECODE_LOG"; then
    fail "動画のデコードが EOS まで到達しませんでした (exit=${DECODE_STATUS})。ログ:"
    cat "$DECODE_LOG" >&2
  else
    grep 'Got EOS' "$DECODE_LOG"
  fi
fi

echo "== 検査 D: オプションプラグインの rpath が同梱ライブラリを解決すること"
D_TARGETS=()
while IFS= read -r f; do
  D_TARGETS+=("$f")
done < <(
  {
    find "${OPTIONAL_DIR}/plugins" "${OPTIONAL_DIR}/lib" -type f -name '*.so*' 2>/dev/null
    find "${R}/usr/lib/gstreamer-1.0" -name 'libgstvideoparsersbad.so' -type f
  } | sort
)
if [ "${#D_TARGETS[@]}" -eq 0 ]; then
  fail "rpath 検査の対象ファイルが見つかりません。"
fi
for f in "${D_TARGETS[@]}"; do
  LDD_OUT="$(LD_LIBRARY_PATH="${TMP}/openh264" ldd "$f" 2>&1 || true)"
  # libva はホスト依存のため解決できなくてよい
  NOT_FOUND="$(printf '%s\n' "$LDD_OUT" | grep 'not found' | grep -v 'libva' || true)"
  if [ -n "$NOT_FOUND" ]; then
    fail "${f#"$TMP"/} に解決できないライブラリがあります:"
    printf '%s\n' "$NOT_FOUND" >&2
  fi
  OUTSIDE="$(printf '%s\n' "$LDD_OUT" | grep -E '^\s*libgst[^ ]* =>' | grep -v "=> ${R}/usr/" || true)"
  if [ -n "$OUTSIDE" ]; then
    fail "${f#"$TMP"/} の libgst* が AppImage 外に解決されています:"
    printf '%s\n' "$OUTSIDE" >&2
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "AppImage の動画同梱検査に失敗しました。" >&2
  exit 1
fi
echo "AppImage の動画同梱検査にすべて成功しました。"

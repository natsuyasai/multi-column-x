#!/usr/bin/env bash
# build-linux-codec-plugins.sh — H.264/AAC の GStreamer プラグインをソースからビルドし
# src-tauri/gstreamer-plugins/ に配置するスクリプト。
# `npm run tauri:build` / `npm run tauri:build:debug` で AppImage のフルビルドを
# 試す前に、これを一度実行しておく必要がある（.github/workflows/release.yml の
# 「Build Linux codec plugins」ステップと同じロジック）。

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
OUT_DIR="${REPO_ROOT}/src-tauri/gstreamer-plugins"

for cmd in gst-inspect-1.0 meson ninja git patchelf; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "エラー: ${cmd} が見つかりません。以下をインストールしてください: sudo apt install libfdk-aac-dev libopenh264-dev libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-tools meson ninja-build libva-dev libdrm-dev libgudev-1.0-dev patchelf" >&2
    exit 1
  fi
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

GST_VER=$(gst-inspect-1.0 --version | head -1 | grep -oP '\d+\.\d+\.\d+')
git clone --filter=blob:none --no-checkout --depth 1 --branch "${GST_VER}" \
  https://gitlab.freedesktop.org/gstreamer/gstreamer.git "${WORK_DIR}/gst-src"
cd "${WORK_DIR}/gst-src"
git sparse-checkout set --no-cone subprojects/gst-plugins-bad
git checkout "${GST_VER}"
cd subprojects/gst-plugins-bad
meson setup builddir -Dauto_features=disabled -Dfdkaac=enabled -Dopenh264=enabled \
  -Dvideoparsers=enabled -Dva=enabled
ninja -C builddir

# 実際の出力ファイル名・パスを確認できるようログに残す。
find builddir \( -type f -o -type l \) -name '*.so*' | sort

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}/optional/plugins" "${OUT_DIR}/optional/lib"

# 直下 = AppImage の usr/lib 側（linuxdeploy が依存解決して同梱してよいもの）
cp builddir/ext/fdkaac/libgstfdkaac.so "${OUT_DIR}/"
cp -L /usr/lib/x86_64-linux-gnu/libfdk-aac.so.2 "${OUT_DIR}/"
cp builddir/gst/videoparsers/libgstvideoparsersbad.so "${OUT_DIR}/"
cp -L builddir/gst-libs/gst/codecparsers/libgstcodecparsers-1.0.so.0 "${OUT_DIR}/"
cp -L builddir/gst-libs/gst/codecs/libgstcodecs-1.0.so.0 "${OUT_DIR}/"

# optional/ = AppImage の usr/share/multicolumnx/gst-optional 側。
# linuxdeploy は usr/bin・usr/lib 配下の ELF 依存だけを辿るため、ここに置いた
# libgstopenh264.so / libgstva.so からは libopenh264 / libva が同梱されない。
cp builddir/ext/openh264/libgstopenh264.so "${OUT_DIR}/optional/plugins/"
cp builddir/sys/va/libgstva.so "${OUT_DIR}/optional/plugins/"
cp -L builddir/gst-libs/gst/va/libgstva-1.0.so.0 "${OUT_DIR}/optional/lib/"

# AppImage 内の配置（usr/share/multicolumnx/gst-optional/{plugins,lib}）から
# usr/lib の同梱 GStreamer ライブラリを解決させる。
for f in "${OUT_DIR}"/optional/plugins/*.so; do
  patchelf --set-rpath '$ORIGIN/../lib:$ORIGIN/../../../../lib' "$f"
done
for f in "${OUT_DIR}"/optional/lib/*.so.0; do
  patchelf --set-rpath '$ORIGIN/../../../../lib' "$f"
done

# usr/lib 側に置くファイルの RUNPATH を AppDir 内の最終配置に合わせる。
# linuxdeploy は usr/lib 配下の既存 ELF の依存を解決するため、meson のビルドツリー相対の
# RUNPATH（例: $ORIGIN/../codecparsers）のままだと、システムに libgstcodecparsers が無い
# 環境（CI ランナー）で `Could not find dependency` になり失敗する。
# 開発機にはシステム版があるため見逃しやすい。
#   usr/lib/libgstcodecparsers-1.0.so.0 / usr/lib/libgstcodecs-1.0.so.0 → 同じ usr/lib
#   usr/lib/gstreamer-1.0/libgstvideoparsersbad.so → 1 つ上の usr/lib
patchelf --set-rpath '$ORIGIN' "${OUT_DIR}/libgstcodecparsers-1.0.so.0"
patchelf --set-rpath '$ORIGIN' "${OUT_DIR}/libgstcodecs-1.0.so.0"
patchelf --set-rpath '$ORIGIN/..' "${OUT_DIR}/libgstvideoparsersbad.so"

echo "GStreamer コーデックプラグインを ${OUT_DIR} に配置しました。"

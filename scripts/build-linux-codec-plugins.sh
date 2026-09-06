#!/usr/bin/env bash
# build-linux-codec-plugins.sh — H.264/AAC の GStreamer プラグインをソースからビルドし
# src-tauri/gstreamer-plugins/ に配置するスクリプト。
# `npm run tauri:build` / `npm run tauri:build:debug` で AppImage のフルビルドを
# 試す前に、これを一度実行しておく必要がある（.github/workflows/release.yml の
# 「Build Linux codec plugins」ステップと同じロジック）。

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
OUT_DIR="${REPO_ROOT}/src-tauri/gstreamer-plugins"

for cmd in gst-inspect-1.0 meson ninja git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "エラー: ${cmd} が見つかりません。以下をインストールしてください: sudo apt install libfdk-aac-dev libopenh264-dev libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-tools meson ninja-build" >&2
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
meson setup builddir -Dauto_features=disabled -Dfdkaac=enabled -Dopenh264=enabled
ninja -C builddir

mkdir -p "${OUT_DIR}"
cp builddir/ext/fdkaac/libgstfdkaac.so "${OUT_DIR}/"
cp builddir/ext/openh264/libgstopenh264.so "${OUT_DIR}/"
cp -L /usr/lib/x86_64-linux-gnu/libfdk-aac.so.2 "${OUT_DIR}/"

echo "GStreamer コーデックプラグインを ${OUT_DIR} に配置しました。"

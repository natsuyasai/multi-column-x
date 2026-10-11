// src/hooks/useUiScale.ts
// アプリ自身の UI（React 部分）の倍率を <html> の font-size へ反映するフック。
// 端末追従値（Android のフォントサイズ倍率）の測定・再測定と、レイアウト定数の
// px 変換用 rootFontPx（lib/uiScale.ts）の同期を担う。
import { useEffect, useState } from "react";
import {
  measureDeviceFontScale,
  resolveDeviceUiScale,
  resolveUiScale,
  ROOT_FONT_BASE_PX,
  setRootFontPx,
} from "@/lib/uiScale";
import type { UiScale } from "@/types";

export function useUiScale(uiScale: UiScale, isMobile: boolean): number {
  const [measured, setMeasured] = useState(1);

  // 端末の倍率は Android のみ測定する。実行中の変化は resize / フォアグラウンド復帰で再測定し、
  // 値が変わったときだけ state を更新する。
  useEffect(() => {
    if (!isMobile) return;
    const remeasure = () => {
      setMeasured(measureDeviceFontScale());
    };
    remeasure();
    window.addEventListener("resize", remeasure);
    document.addEventListener("visibilitychange", remeasure);
    return () => {
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("visibilitychange", remeasure);
    };
  }, [isMobile]);

  const scale = resolveUiScale(
    uiScale,
    resolveDeviceUiScale(isMobile, measured),
  );

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    const px = ROOT_FONT_BASE_PX * scale;
    root.style.fontSize = `${px}px`;
    setRootFontPx(px);
    return () => {
      root.style.fontSize = previous;
      setRootFontPx(ROOT_FONT_BASE_PX);
    };
  }, [scale]);

  return scale;
}

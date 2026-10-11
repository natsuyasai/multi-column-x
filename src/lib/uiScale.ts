import type { UiScale } from "@/types";

export const ROOT_FONT_BASE_PX = 16;
export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.5;

export function clampUiScale(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, v));
}

export function resolveDeviceUiScale(
  isMobile: boolean,
  measured: number,
): number {
  return isMobile ? clampUiScale(measured) : 1;
}

export const UI_SCALE_PRESETS: Record<Exclude<UiScale, "auto">, number> = {
  small: 0.875,
  standard: 1,
  large: 1.125,
  xLarge: 1.25,
};

export function resolveUiScale(setting: UiScale, deviceScale: number): number {
  if (Object.prototype.hasOwnProperty.call(UI_SCALE_PRESETS, setting)) {
    return UI_SCALE_PRESETS[setting as Exclude<UiScale, "auto">];
  }
  return clampUiScale(deviceScale);
}

let rootFontPx = ROOT_FONT_BASE_PX;

export function setRootFontPx(px: number): void {
  rootFontPx = px;
}

export function remToPx(rem: number): number {
  return Math.round(rem * rootFontPx);
}

/** プローブ（font-size: medium）の computed px から端末倍率を求める。解釈できなければ 1。 */
export function measureDeviceFontScale(doc: Document = document): number {
  const probe = doc.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.fontSize = "medium";
  doc.body.appendChild(probe);
  try {
    const px = parseFloat(getComputedStyle(probe).fontSize);
    return Number.isFinite(px) && px > 0 ? px / ROOT_FONT_BASE_PX : 1;
  } finally {
    probe.remove();
  }
}

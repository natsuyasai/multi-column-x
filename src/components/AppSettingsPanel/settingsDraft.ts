import type { ColumnScale, GlobalSettings } from "../../types";

export const SWIPE_AREA_MIN_HEIGHT = 16;
export const SWIPE_AREA_MAX_HEIGHT = 56;

/**
 * AppSettingsPanel の「一般」タブが編集する設定項目のドラフト state。
 *
 * GlobalSettings のフォーム編集対象フィールドの部分集合 + フォーム固有の
 * 表現（テキストエリア文字列・入力中の文字列など）をまとめたもの。
 * 22 個の独立した useState を単一オブジェクト state に一本化するための型。
 */
export interface SettingsDraft {
  theme: GlobalSettings["theme"];
  defaultAutoReloadEnabled: boolean;
  defaultAutoReloadInterval: number;
  defaultShowCountdown: boolean;
  defaultAreaRemoveEnabled: boolean;
  defaultShowCustomMenu: boolean;
  defaultScrollPosRestoreEnabled: boolean;
  defaultColumnCustomCSS: string;
  popupEscCloseEnabled: boolean;
  videoAutoPlayStopEnabled: boolean;
  imagePopupEnabled: boolean;
  videoPopupEnabled: boolean;
  smallImageEnabled: boolean;
  smallImageWidth: string;
  blurImageEnabled: boolean;
  blurImageAmount: string;
  hideAdEnabled: boolean;
  columnScale: ColumnScale;
  useXAppForCompose: boolean;
  mobileSwipeAreaEnabled: boolean;
  /** number入力欄への入力中文字列をそのまま保持するため string で持つ */
  mobileSwipeAreaHeight: string;
  mobileTwoColumnEnabled: boolean;
  /** textarea への入力中文字列をそのまま保持するため string で持つ */
  globalNgWordsText: string;
}

/** ドラフトの単一フィールドを更新するヘルパーの型（子セクションへ props で渡す） */
export type SetSettingsDraft = <K extends keyof SettingsDraft>(
  key: K,
  value: SettingsDraft[K],
) => void;

/**
 * GlobalSettings からフォームドラフトの初期値を組み立てる。
 */
export function createSettingsDraft(settings: GlobalSettings): SettingsDraft {
  return {
    theme: settings.theme ?? "dark",
    defaultAutoReloadEnabled: settings.defaultAutoReloadEnabled,
    defaultAutoReloadInterval: settings.defaultAutoReloadInterval,
    defaultShowCountdown: settings.defaultShowCountdown,
    defaultAreaRemoveEnabled: settings.defaultAreaRemoveEnabled,
    defaultShowCustomMenu: settings.defaultShowCustomMenu,
    defaultScrollPosRestoreEnabled: settings.defaultScrollPosRestoreEnabled,
    defaultColumnCustomCSS: settings.defaultColumnCustomCSS,
    popupEscCloseEnabled: settings.popupEscCloseEnabled,
    videoAutoPlayStopEnabled: settings.videoAutoPlayStopEnabled,
    imagePopupEnabled: settings.imagePopupEnabled,
    videoPopupEnabled: settings.videoPopupEnabled,
    smallImageEnabled: settings.smallImageEnabled,
    smallImageWidth: settings.smallImageWidth,
    blurImageEnabled: settings.blurImageEnabled,
    blurImageAmount: settings.blurImageAmount,
    hideAdEnabled: settings.hideAdEnabled,
    columnScale: settings.columnScale ?? "default",
    useXAppForCompose: settings.useXAppForCompose ?? false,
    mobileSwipeAreaEnabled: settings.mobileSwipeAreaEnabled,
    mobileSwipeAreaHeight: String(settings.mobileSwipeAreaHeight),
    mobileTwoColumnEnabled: settings.mobileTwoColumnEnabled,
    globalNgWordsText: (settings.ngWords ?? []).join("\n"),
  };
}

// 入力中の自由編集を許すため、確定時（適用・blur）にのみ有効範囲へ補正する。
export function clampSwipeAreaHeight(value: string): number {
  return Math.min(
    SWIPE_AREA_MAX_HEIGHT,
    Math.max(SWIPE_AREA_MIN_HEIGHT, Number(value) || SWIPE_AREA_MIN_HEIGHT),
  );
}

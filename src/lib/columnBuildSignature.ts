import type { Column, GlobalSettings } from "@/types";

/**
 * カラム WebView の構築時（initialization_script）に埋め込まれる設定値の署名を返す。
 * 署名が構築時と現在で異なる場合、その WebView は古い設定のまま動いている。
 * 埋め込まれない項目（位置・幅・自動更新間隔・テーマ等）は含めない。
 */
export function columnBuildSignature(
  column: Column,
  global: GlobalSettings,
): string {
  const s = column.settings;
  return JSON.stringify({
    // URL 決定要素
    pageType: column.pageType,
    customUrl: column.customUrl,
    homeTabName: column.homeTabName,
    searchQuery: column.searchQuery,
    searchLiveTab: column.searchLiveTab,
    listId: column.listId,
    // カラム個別設定
    hideHeaderEnabled: s.hideHeaderEnabled,
    hideTweetInputEnabled: s.hideTweetInputEnabled,
    showCustomMenu: s.showCustomMenu,
    scrollPosRestoreEnabled: s.scrollPosRestoreEnabled,
    smallImageEnabled: s.smallImageEnabled,
    smallImageWidth: s.smallImageWidth,
    blurImageEnabled: s.blurImageEnabled,
    blurImageAmount: s.blurImageAmount,
    customCSS: s.customCSS,
    visibleLinks: s.visibleLinks,
    ngWords: s.ngWords,
    repostHiddenUserIds: s.repostHiddenUserIds ?? [],
    whitelistEnabled: s.whitelistEnabled,
    whitelistWords: s.whitelistWords,
    returnToLastReadEnabled: s.returnToLastReadEnabled,
    // 全体設定
    globalVideoAutoPlayStopEnabled: global.videoAutoPlayStopEnabled,
    globalHideAdEnabled: global.hideAdEnabled,
    globalApiRateLimitMonitorEnabled: global.apiRateLimitMonitorEnabled,
    globalImagePopupEnabled: global.imagePopupEnabled,
    globalVideoPopupEnabled: global.videoPopupEnabled,
    globalNgWords: global.ngWords,
    globalRepostHiddenUserIds: global.repostHiddenUserIds ?? [],
    globalMobileSwipeAreaEnabled: global.mobileSwipeAreaEnabled,
    globalMobileSwipeAreaHeight: global.mobileSwipeAreaHeight,
    globalLanguage: global.language,
  });
}

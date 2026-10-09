import { describe, expect, it } from "vitest";
import type { GlobalSettings } from "../../types";
import {
  createSettingsDraft,
  toColumnDefaults,
  toGlobalSettingsPatch,
} from "./settingsDraft";

const baseGlobalSettings: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  defaultShowCountdown: true,
  defaultHideHeaderEnabled: true,
  defaultHideTweetInputEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: false,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: true,
  imagePopupEnabled: true,
  videoPopupEnabled: true,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: true,
  apiRateLimitMonitorEnabled: true,
  columnScale: "default",
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
  mobileSwipeAreaOpacity: 50,
  mobileTwoColumnEnabled: true,
  presets: [],
  ngWords: [],
  repostHiddenUserIds: [],
  pendingDataDirectoryDeletions: [],
  hardwareVideoDecodeEnabled: true,
  h264DownloadPromptDismissed: false,
};

describe("toGlobalSettingsPatch", () => {
  it("draftの全項目がパッチに含まれる（表示サイズ・テーマの上書きは含まない）", () => {
    const draft = createSettingsDraft(baseGlobalSettings);
    const patch = toGlobalSettingsPatch(draft, {
      ngWords: ["spam"],
      repostHiddenUserIds: ["user_a"],
    });
    expect(patch).toEqual({
      defaultAutoReloadEnabled: true,
      defaultAutoReloadInterval: 600,
      defaultShowCountdown: true,
      defaultHideHeaderEnabled: true,
      defaultHideTweetInputEnabled: true,
      defaultShowCustomMenu: false,
      defaultScrollPosRestoreEnabled: false,
      defaultColumnCustomCSS: "",
      popupEscCloseEnabled: true,
      videoAutoPlayStopEnabled: true,
      imagePopupEnabled: true,
      videoPopupEnabled: true,
      smallImageEnabled: false,
      smallImageWidth: "50%",
      blurImageEnabled: false,
      blurImageAmount: "10px",
      hideAdEnabled: true,
      apiRateLimitMonitorEnabled: true,
      useXAppForCompose: false,
      mobileSwipeAreaEnabled: true,
      mobileSwipeAreaHeight: 28,
      mobileSwipeAreaOpacity: 50,
      mobileTwoColumnEnabled: true,
      ngWords: ["spam"],
      repostHiddenUserIds: ["user_a"],
    });
  });

  it("columnScaleOverrideEnabledがfalseのときはcolumnScaleを含まない", () => {
    const draft = createSettingsDraft(baseGlobalSettings);
    const patch = toGlobalSettingsPatch(draft, {
      ngWords: [],
      repostHiddenUserIds: [],
    });
    expect(patch).not.toHaveProperty("columnScale");
  });

  it("columnScaleOverrideEnabledがtrueのときはdraft.columnScaleを含む", () => {
    const draft = {
      ...createSettingsDraft(baseGlobalSettings),
      columnScaleOverrideEnabled: true,
      columnScale: "large" as const,
    };
    const patch = toGlobalSettingsPatch(draft, {
      ngWords: [],
      repostHiddenUserIds: [],
    });
    expect(patch).toHaveProperty("columnScale", "large");
  });

  it("themeOverrideEnabledがfalseのときはthemeを含まない", () => {
    const draft = createSettingsDraft(baseGlobalSettings);
    const patch = toGlobalSettingsPatch(draft, {
      ngWords: [],
      repostHiddenUserIds: [],
    });
    expect(patch).not.toHaveProperty("theme");
  });

  it("themeOverrideEnabledがtrueのときはdraft.themeを含む", () => {
    const draft = {
      ...createSettingsDraft(baseGlobalSettings),
      themeOverrideEnabled: true,
      theme: "light" as const,
    };
    const patch = toGlobalSettingsPatch(draft, {
      ngWords: [],
      repostHiddenUserIds: [],
    });
    expect(patch).toHaveProperty("theme", "light");
  });

  it("スワイプ領域の高さは範囲外の入力値でも有効範囲(16〜56)に丸められる", () => {
    const draft = {
      ...createSettingsDraft(baseGlobalSettings),
      mobileSwipeAreaHeight: "999",
    };
    const patch = toGlobalSettingsPatch(draft, {
      ngWords: [],
      repostHiddenUserIds: [],
    });
    expect(patch.mobileSwipeAreaHeight).toBe(56);
  });
});

describe("toColumnDefaults", () => {
  it("カラムデフォルトの全12項目がパッチに含まれる", () => {
    const settings: GlobalSettings = {
      ...baseGlobalSettings,
      defaultAutoReloadEnabled: false,
      defaultAutoReloadInterval: 123,
      defaultShowCountdown: false,
      defaultHideHeaderEnabled: false,
      defaultHideTweetInputEnabled: false,
      defaultShowCustomMenu: true,
      defaultScrollPosRestoreEnabled: true,
      defaultColumnCustomCSS: ".test{}",
      smallImageEnabled: true,
      smallImageWidth: "70%",
      blurImageEnabled: true,
      blurImageAmount: "20px",
    };
    const draft = createSettingsDraft(settings);
    const patch = toColumnDefaults(draft);
    expect(patch).toEqual({
      autoReloadEnabled: false,
      autoReloadInterval: 123,
      showCountdown: false,
      hideHeaderEnabled: false,
      hideTweetInputEnabled: false,
      showCustomMenu: true,
      scrollPosRestoreEnabled: true,
      customCSS: ".test{}",
      smallImageEnabled: true,
      smallImageWidth: "70%",
      blurImageEnabled: true,
      blurImageAmount: "20px",
    });
  });
});

import { describe, expect, it } from "vitest";
import { createSettingsDraft } from "@/components/AppSettingsPanel/settingsDraft";
import type { SettingsDraft } from "@/components/AppSettingsPanel/settingsDraft";
import type { ColumnSettings, GlobalSettings } from "@/types";
import {
  nextColumnSettingsOnSmallImageChange,
  nextDraftOnSmallImageChange,
} from "./scrollRestoreSetting";

const columnSettings = (
  smallImageEnabled: boolean,
  scrollPosRestoreEnabled: boolean,
): ColumnSettings => ({
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: true,
  hideHeaderEnabled: false,
  hideTweetInputEnabled: false,
  showCustomMenu: false,
  scrollPosRestoreEnabled,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  repostHiddenUserIds: [],
  whitelistEnabled: false,
  whitelistWords: [],
  returnToLastReadEnabled: false,
});

const draft = (
  smallImageEnabled: boolean,
  defaultScrollPosRestoreEnabled: boolean,
): SettingsDraft => ({
  ...createSettingsDraft({
    smallImageEnabled,
    defaultScrollPosRestoreEnabled,
    mobileSwipeAreaHeight: 30,
  } as GlobalSettings),
  smallImageEnabled,
  defaultScrollPosRestoreEnabled,
});

describe("nextColumnSettingsOnSmallImageChange", () => {
  it("画像を縮小表示するをOFFにすると写真閲覧後のスクロール位置を復元する設定もOFFになる", () => {
    const next = nextColumnSettingsOnSmallImageChange(
      columnSettings(true, true),
      false,
    );
    expect(next.smallImageEnabled).toBe(false);
    expect(next.scrollPosRestoreEnabled).toBe(false);
  });

  it("画像を縮小表示するをOFFにしてから再度ONにしても復元設定はOFFのままである", () => {
    const off = nextColumnSettingsOnSmallImageChange(
      columnSettings(true, true),
      false,
    );
    const on = nextColumnSettingsOnSmallImageChange(off, true);
    expect(on.smallImageEnabled).toBe(true);
    expect(on.scrollPosRestoreEnabled).toBe(false);
  });

  it("画像を縮小表示するをOFFにしても復元設定がもともとOFFならOFFのままである", () => {
    const next = nextColumnSettingsOnSmallImageChange(
      columnSettings(true, false),
      false,
    );
    expect(next.scrollPosRestoreEnabled).toBe(false);
  });

  it("画像を縮小表示するをONにしても復元設定は変更されない", () => {
    expect(
      nextColumnSettingsOnSmallImageChange(columnSettings(false, true), true)
        .scrollPosRestoreEnabled,
    ).toBe(true);
  });

  it("元の設定オブジェクトを変更しない", () => {
    const prev = columnSettings(true, true);
    nextColumnSettingsOnSmallImageChange(prev, false);
    expect(prev.smallImageEnabled).toBe(true);
    expect(prev.scrollPosRestoreEnabled).toBe(true);
  });
});

describe("nextDraftOnSmallImageChange", () => {
  it("画像を縮小表示するをOFFにすると写真閲覧後のスクロール位置を復元する設定もOFFになる", () => {
    const next = nextDraftOnSmallImageChange(draft(true, true), false);
    expect(next.smallImageEnabled).toBe(false);
    expect(next.defaultScrollPosRestoreEnabled).toBe(false);
  });

  it("画像を縮小表示するをOFFにしてから再度ONにしても復元設定はOFFのままである", () => {
    const off = nextDraftOnSmallImageChange(draft(true, true), false);
    const on = nextDraftOnSmallImageChange(off, true);
    expect(on.smallImageEnabled).toBe(true);
    expect(on.defaultScrollPosRestoreEnabled).toBe(false);
  });

  it("画像を縮小表示するをOFFにしても復元設定がもともとOFFならOFFのままである", () => {
    expect(
      nextDraftOnSmallImageChange(draft(true, false), false)
        .defaultScrollPosRestoreEnabled,
    ).toBe(false);
  });

  it("画像を縮小表示するをONにしても復元設定は変更されない", () => {
    expect(
      nextDraftOnSmallImageChange(draft(false, true), true)
        .defaultScrollPosRestoreEnabled,
    ).toBe(true);
  });
});

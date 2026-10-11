import type { SettingsDraft } from "@/components/AppSettingsPanel/settingsDraft";
import type { ColumnSettings } from "@/types";

/**
 * 「画像を縮小表示する」の切替に応じたカラム設定を返す。
 * 縮小表示をOFFにするときは、縮小画像が前提の「写真閲覧後のスクロール位置を復元する」もOFFにする。
 * ONにするときは復元設定を変更しない。
 */
export function nextColumnSettingsOnSmallImageChange(
  prev: ColumnSettings,
  smallImageEnabled: boolean,
): ColumnSettings {
  return {
    ...prev,
    smallImageEnabled,
    ...(smallImageEnabled ? {} : { scrollPosRestoreEnabled: false }),
  };
}

/** 「カラムデフォルト」ドラフト版。 */
export function nextDraftOnSmallImageChange(
  prev: SettingsDraft,
  smallImageEnabled: boolean,
): SettingsDraft {
  return {
    ...prev,
    smallImageEnabled,
    ...(smallImageEnabled ? {} : { defaultScrollPosRestoreEnabled: false }),
  };
}

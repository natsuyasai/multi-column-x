// src/hooks/useSettingsApplyHandlers.ts
// カラム個別設定・全体設定の「適用」処理をまとめたフック。
import { useCallback } from "react";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import { getMql } from "@/hooks/useTheme";
import { resolveTheme } from "@/lib/theme";
import {
  applyColumnSettingsScripts,
  buildGlobalNgScripts,
  evalInColumn,
} from "@/services/columnWebview";
import { useAppStore } from "@/store/useAppStore";
import type { ColumnSettings, GlobalSettings } from "@/types";

interface UseSettingsApplyHandlersArgs {
  handleUpdateColumn: (
    columnId: string,
    patch: { settings: ColumnSettings; width: number; label?: string },
  ) => void;
  setSettingsColumnId: (id: string | null) => void;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
}

interface UseSettingsApplyHandlersResult {
  handleApplySettings: (
    columnId: string,
    settings: ColumnSettings,
    width: number,
    label: string | undefined,
  ) => Promise<void>;
  handleApplyGlobalSettings: (patch: Partial<GlobalSettings>) => void;
}

export function useSettingsApplyHandlers({
  handleUpdateColumn,
  setSettingsColumnId,
  updateGlobalSettings,
}: UseSettingsApplyHandlersArgs): UseSettingsApplyHandlersResult {
  const handleApplySettings = useCallback(
    async (
      columnId: string,
      settings: ColumnSettings,
      width: number,
      label: string | undefined,
    ) => {
      handleUpdateColumn(columnId, { settings, width, label });
      setSettingsColumnId(null);
      // クロージャの古い値を避けるため、最新の globalSettings をここで読み直す
      const { globalSettings: currentGlobal } = useAppStore.getState();
      await applyColumnSettingsScripts(
        columnId,
        settings,
        currentGlobal.ngWords ?? [],
        currentGlobal.repostHiddenUserIds ?? [],
      );
    },
    [handleUpdateColumn, setSettingsColumnId],
  );

  const handleApplyGlobalSettings = useCallback(
    (patch: Partial<GlobalSettings>) => {
      updateGlobalSettings(patch);
      // クロージャの古い値を避けるため、最新の columns/globalSettings をここで読み直す
      const { columns: ngColumns, globalSettings: currentGlobal } =
        useAppStore.getState();
      buildGlobalNgScripts(patch, currentGlobal, ngColumns).forEach(
        ({ columnId, script }) => {
          evalInColumn(columnId, script);
        },
      );
      if (patch.theme !== undefined) {
        const prefersDark = getMql()?.matches ?? false;
        const nightMode =
          resolveTheme(patch.theme, prefersDark) === "dark" ? "2" : "0";
        const { columns: currentColumns } = useAppStore.getState();
        currentColumns.forEach((col) => {
          evalInColumn(col.id, WEBVIEW_SCRIPTS.applyNightModeCookie(nightMode));
        });
      }
    },
    [updateGlobalSettings],
  );

  return { handleApplySettings, handleApplyGlobalSettings };
}

// src/hooks/useSettingsApplyHandlers.ts
// カラム個別設定・全体設定の「適用」処理をまとめたフック。
import { useCallback } from "react";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import { getMql } from "@/hooks/useTheme";
import {
  getOsLocale,
  normalizeLanguageSetting,
  resolveLanguage,
} from "@/lib/language";
import { logError } from "@/lib/log";
import { resolveTheme } from "@/lib/theme";
import { buildGlobalNgScripts, evalInColumn } from "@/services/columnWebview";
import { useAppStore } from "@/store/useAppStore";
import type { ColumnSettings, GlobalSettings } from "@/types";

interface UseSettingsApplyHandlersArgs {
  handleUpdateColumn: (
    columnId: string,
    patch: { settings: ColumnSettings; width: number; label?: string },
  ) => void;
  setSettingsColumnId: (id: string | null) => void;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
  recreateColumnWebview: (columnId: string) => Promise<void>;
  recreateStaleColumns: () => Promise<void>;
}

interface UseSettingsApplyHandlersResult {
  handleApplySettings: (
    columnId: string,
    settings: ColumnSettings,
    width: number,
    label: string | undefined,
  ) => Promise<void>;
  handleApplyGlobalSettings: (patch: Partial<GlobalSettings>) => Promise<void>;
}

export function useSettingsApplyHandlers({
  handleUpdateColumn,
  setSettingsColumnId,
  updateGlobalSettings,
  recreateColumnWebview,
  recreateStaleColumns,
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
      // 埋め込み設定（ぼかし等）は WebView 作成時にしか反映されないため、当該カラムだけ再構築する
      await recreateColumnWebview(columnId);
    },
    [handleUpdateColumn, setSettingsColumnId, recreateColumnWebview],
  );

  const handleApplyGlobalSettings = useCallback(
    async (patch: Partial<GlobalSettings>) => {
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
      if (patch.language !== undefined) {
        // 開いているカラムの注入UIの表示言語を即時に切り替える（ポップアップは作成時の言語のまま）
        const lang = resolveLanguage(
          normalizeLanguageSetting(patch.language),
          getOsLocale(),
        );
        const { columns: currentColumns } = useAppStore.getState();
        currentColumns.forEach((col) => {
          evalInColumn(col.id, WEBVIEW_SCRIPTS.setInjectLanguage(lang));
        });
      }
      // 埋め込み値が古くなったカラムだけ再構築する（無関係な項目なら対象は0件）
      await recreateStaleColumns().catch(logError("handleApplyGlobalSettings"));
    },
    [updateGlobalSettings, recreateStaleColumns],
  );

  return { handleApplySettings, handleApplyGlobalSettings };
}

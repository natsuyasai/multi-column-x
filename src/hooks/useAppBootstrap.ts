// src/hooks/useAppBootstrap.ts
// アプリ起動時の初期化処理（プラットフォーム検出→設定ロード→バージョン取得→
// カラム復元→表示サイズ適用）をまとめたフック。effect の宣言順が意味を持つため、
// 呼び出し側（App.tsx）でも同じ位置で呼び出すこと。
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";
import { IPC_COMMANDS, WEBVIEW_SCRIPTS } from "@/constants/ipc";
import { logError } from "@/lib/log";
import { evalInColumn } from "@/services/columnWebview";
import type { Column, ColumnScale } from "@/types";

interface UseAppBootstrapArgs {
  setIsMobile: (mobile: boolean) => void;
  setProfileApiSupported: (supported: boolean) => void;
  loadSettings: () => void;
  isLoaded: boolean;
  restoreColumns: (topBarHeight: number) => Promise<void>;
  topBarHeight: number;
  columns: Column[];
  columnScale: ColumnScale | undefined;
}

interface UseAppBootstrapResult {
  columnsRestored: boolean;
  appVersion: string;
}

export function useAppBootstrap({
  setIsMobile,
  setProfileApiSupported,
  loadSettings,
  isLoaded,
  restoreColumns,
  topBarHeight,
  columns,
  columnScale,
}: UseAppBootstrapArgs): UseAppBootstrapResult {
  // カラム（ネイティブ WebView）の復元が完了したかどうか。
  // 起動時の更新チェックは復元完了後にゲートし、UpdateDialog がカラムの裏に隠れるのを防ぐ。
  const [columnsRestored, setColumnsRestored] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  // プラットフォーム検出は loadSettings より先に完了させる必要がある。
  // restoreColumns（isLoaded 後に呼ばれる）が isMobile を読むため、
  // setIsMobile は同期的に完了しなければならない。effect の順序を変えないこと。
  useEffect(() => {
    try {
      const mobile = platform() === "android";
      setIsMobile(mobile);
      if (mobile) {
        invoke<boolean>(IPC_COMMANDS.IS_WEBVIEW_PROFILE_SUPPORTED)
          .then(setProfileApiSupported)
          .catch(logError("is_webview_profile_supported"));
      }
    } catch (e) {
      logError("platform()")(e);
    }
  }, [setIsMobile, setProfileApiSupported]);

  // マウント時のみ設定をロードする（loadSettings 変化で再実行させない）
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(logError("getVersion"));
  }, []);

  // isLoaded が true になった（= DOM レンダリング完了後）タイミングで WebView を復元
  // isLoaded の true 遷移時のみ実行し、topBarHeight 変化で再復元させない
  useEffect(() => {
    if (isLoaded) {
      // 復元が一巡したら（成功・失敗どちらでも）フラグを立て、起動時更新チェックを解放する
      restoreColumns(topBarHeight).finally(() => setColumnsRestored(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // x.com の表示サイズを IndexedDB 経由で設定する
  // localforage の device:rweb:settings.scale を更新し、変化があればページをリロードする
  // isLoaded 後のみ実行し、WebView 作成前に呼び出されることを防ぐ
  useEffect(() => {
    const scale = columnScale ?? "default";
    if (!isLoaded) return;
    columns.forEach((column) => {
      evalInColumn(column.id, WEBVIEW_SCRIPTS.applyColumnScale(scale));
    });
    // columnScale/isLoaded 変化時のみ scale を適用し、columns 変化では再適用しない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnScale, isLoaded]);

  return { columnsRestored, appVersion };
}

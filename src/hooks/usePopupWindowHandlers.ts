// src/hooks/usePopupWindowHandlers.ts
// リンクポップアップ・公式設定ポップアップ・投稿ウィンドウの起動処理をまとめたフック。
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { IPC_COMMANDS } from "@/constants/ipc";
import { resolveLinkPopupUrl } from "@/lib/linkPopupUrl";
import { logError } from "@/lib/log";
import type { Account } from "@/types";

/**
 * 指定 accountId のアカウントを返す。見つからなければ先頭のアカウントにフォールバックする。
 * accounts が空の場合は実行時に undefined になり得るが、既存の呼び出し側と同じく
 * 型上は Account を返す（呼び出し側の undefined チェックの有無を変えないため）。
 */
function resolveAccount(accounts: Account[], accountId: string): Account {
  return accounts.find((a) => a.id === accountId) ?? accounts[0];
}

interface UsePopupWindowHandlersArgs {
  accounts: Account[];
  defaultAccountId: string | undefined;
  setShowLinkPopupDialog: (v: boolean) => void;
  setShowAppSettings: (v: boolean) => void;
  setShowOfficialSettingsDialog: (v: boolean) => void;
}

interface UsePopupWindowHandlersResult {
  handleSubmitLinkPopup: (url: string, accountId: string) => Promise<void>;
  handleOpenOfficialSettings: () => void;
  handleSubmitOfficialSettings: (
    url: string,
    accountId: string,
  ) => Promise<void>;
  handleComposeTweet: () => void;
}

export function usePopupWindowHandlers({
  accounts,
  defaultAccountId,
  setShowLinkPopupDialog,
  setShowAppSettings,
  setShowOfficialSettingsDialog,
}: UsePopupWindowHandlersArgs): UsePopupWindowHandlersResult {
  const handleSubmitLinkPopup = useCallback(
    async (url: string, accountId: string) => {
      setShowLinkPopupDialog(false);
      const trimmedUrl = url.trim();
      if (!trimmedUrl) return;
      const resolved = resolveLinkPopupUrl(trimmedUrl);
      const account = resolveAccount(accounts, accountId);
      if (!account) return;
      // webviewLabelCaller は渡さない。実際の送信元 WebView（呼び出し元）は
      // Rust 側が caller.label() で判定するため、JS が自己申告する必要も権限も無い。
      await invoke(IPC_COMMANDS.OPEN_LINK_POPUP_WINDOW, {
        accountId: account.id,
        url: resolved,
      }).catch(logError("handleSubmitLinkPopup:openLinkPopupWindow"));
    },
    [accounts, setShowLinkPopupDialog],
  );

  const handleOpenOfficialSettings = useCallback(() => {
    setShowAppSettings(false);
    setShowOfficialSettingsDialog(true);
  }, [setShowAppSettings, setShowOfficialSettingsDialog]);

  const handleSubmitOfficialSettings = useCallback(
    async (url: string, accountId: string) => {
      setShowOfficialSettingsDialog(false);
      const account = resolveAccount(accounts, accountId);
      if (!account) return;
      // webviewLabelCaller は渡さない。実際の送信元 WebView（呼び出し元）は
      // Rust 側が caller.label() で判定するため、JS が自己申告する必要も権限も無い。
      await invoke(IPC_COMMANDS.OPEN_LINK_POPUP_WINDOW, {
        accountId: account.id,
        url,
      }).catch(logError("handleSubmitOfficialSettings:openLinkPopupWindow"));
    },
    [accounts, setShowOfficialSettingsDialog],
  );

  const handleComposeTweet = useCallback(() => {
    if (accounts.length === 0) return;
    const defaultId = defaultAccountId ?? accounts[0].id;
    const account = resolveAccount(accounts, defaultId);
    invoke(IPC_COMMANDS.OPEN_COMPOSE_WINDOW, {
      accountId: account.id,
      dataDirectory: account.dataDirectory,
    }).catch(logError("handleComposeTweet:openComposeWindow"));
  }, [accounts, defaultAccountId]);

  return {
    handleSubmitLinkPopup,
    handleOpenOfficialSettings,
    handleSubmitOfficialSettings,
    handleComposeTweet,
  };
}

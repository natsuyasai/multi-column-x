// src/hooks/useAccounts.ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useRef, useState } from "react";
import { ACCOUNT_COLORS } from "../constants/accountColors";
import { IPC_COMMANDS, IPC_EVENTS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import type { Account } from "../types";

interface AddAccountResult {
  accountId: string;
  dataDirectory: string;
  windowLabel: string;
}

function parseAddAccountResult(raw: string): AddAccountResult {
  try {
    return JSON.parse(raw) as AddAccountResult;
  } catch {
    throw new Error("Failed to parse open_add_account_window response");
  }
}

// ログイン完了後、アカウント名の入力待ちであることを表す状態。
// AccountNameDialog はこの値の有無で表示・非表示を切り替える。
export interface PendingAccountName {
  accountId: string;
  dataDirectory: string;
  windowLabel: string;
  defaultValue: string;
}

// アカウント削除の確認待ちであることを表す状態。
// ConfirmDialog はこの値の有無で表示・非表示を切り替える。
export interface PendingAccountRemoval {
  id: string;
  label: string;
  dataDirectory: string;
}

export function useAccounts() {
  const { accounts, addAccount, removeAccount, isMobile } = useAppStore();
  const isAddingRef = useRef(false);
  const [pendingAccountName, setPendingAccountName] =
    useState<PendingAccountName | null>(null);
  const [pendingRemoval, setPendingRemoval] =
    useState<PendingAccountRemoval | null>(null);

  const requestAccountName = useCallback(
    (accountId: string, dataDirectory: string, windowLabel: string) => {
      const currentAccounts = useAppStore.getState().accounts;
      setPendingAccountName({
        accountId,
        dataDirectory,
        windowLabel,
        defaultValue: `アカウント ${currentAccounts.length + 1}`,
      });
    },
    [],
  );

  const submitAccountName = useCallback(
    async (name: string) => {
      const pending = pendingAccountName;
      if (!pending) return;

      const currentAccounts = useAppStore.getState().accounts;
      const color =
        ACCOUNT_COLORS[currentAccounts.length % ACCOUNT_COLORS.length];
      const account: Account = {
        id: pending.accountId,
        label: name,
        dataDirectory: pending.dataDirectory,
        color,
        createdAt: new Date().toISOString(),
      };

      addAccount(account);
      setPendingAccountName(null);
      await invoke(IPC_COMMANDS.CLOSE_WINDOW, {
        label: pending.windowLabel,
      }).catch(() => {});
    },
    [pendingAccountName, addAccount],
  );

  const cancelAccountName = useCallback(() => {
    const pending = pendingAccountName;
    setPendingAccountName(null);
    if (pending) {
      // ログインウィンドウ（既に閉じている場合もあるためエラーは無視）を確実に閉じる
      invoke(IPC_COMMANDS.CLOSE_WINDOW, { label: pending.windowLabel }).catch(
        () => {},
      );
    }
  }, [pendingAccountName]);

  const startAddAccount = useCallback(async () => {
    if (isAddingRef.current || pendingAccountName) return;
    isAddingRef.current = true;

    try {
      if (isMobile) {
        // -----------------------------------------------
        // mobile 専用フロー
        // -----------------------------------------------
        // open_add_account_window は AddAccount Activity が終了するまでブロックする。
        // JavaScript は WebView が suspend 中に一時停止し、
        // AddAccount が finish() して MainActivity が前面に戻った時点で再開する。
        // 成功: resolve → アカウント名入力ダイアログ表示へ
        // キャンセル（バックボタン）: reject → 何もしない
        const raw = await invoke<string>(IPC_COMMANDS.OPEN_ADD_ACCOUNT_WINDOW);
        const parsed = parseAddAccountResult(raw);
        requestAccountName(
          parsed.accountId,
          parsed.dataDirectory,
          parsed.windowLabel,
        );
      } else {
        // -----------------------------------------------
        // desktop 専用フロー
        // -----------------------------------------------
        // open_add_account_window はウィンドウを開いて即座に返る。
        // Rust の URL ポーリングがログイン完了を検出して emit するイベントを listen する。
        const raw = await invoke<string>(IPC_COMMANDS.OPEN_ADD_ACCOUNT_WINDOW);
        const { accountId, dataDirectory, windowLabel } =
          parseAddAccountResult(raw);

        await new Promise<void>((resolve, reject) => {
          let unlistenLogin: (() => void) | null = null;
          let unlistenDestroyed: (() => void) | null = null;

          const cleanup = () => {
            unlistenLogin?.();
            unlistenLogin = null;
            unlistenDestroyed?.();
            unlistenDestroyed = null;
          };

          listen<void>(IPC_EVENTS.ACCOUNT_LOGIN_COMPLETE, () => {
            cleanup();
            requestAccountName(accountId, dataDirectory, windowLabel);
            resolve();
          })
            .then((fn) => {
              unlistenLogin = fn;
            })
            .catch(reject);

          // ログインウィンドウを閉じたことを検出（ユーザーがキャンセル）
          import("@tauri-apps/api/webviewWindow")
            .then(({ WebviewWindow }) => {
              WebviewWindow.getByLabel(windowLabel)
                .then((loginWindow) => {
                  if (!loginWindow) return;
                  loginWindow
                    .once("tauri://destroyed", () => {
                      cleanup();
                      reject(new Error("Login window closed"));
                    })
                    .then((fn) => {
                      unlistenDestroyed = fn;
                    })
                    .catch(() => {});
                })
                .catch(() => {});
            })
            .catch(() => {});
        });
      }
    } catch {
      // mobile: バックボタンによるキャンセルは正常フロー。エラー表示は不要。
      // desktop: ウィンドウを閉じた場合も同様。
    } finally {
      isAddingRef.current = false;
    }
  }, [isMobile, pendingAccountName, requestAccountName]);

  const requestRemoveAccount = useCallback(
    (id: string) => {
      const account = accounts.find((a) => a.id === id);
      if (!account) return;
      setPendingRemoval({
        id: account.id,
        label: account.label,
        dataDirectory: account.dataDirectory,
      });
    },
    [accounts],
  );

  const confirmRemoval = useCallback(async () => {
    const pending = pendingRemoval;
    if (!pending) return;
    setPendingRemoval(null);
    await invoke(IPC_COMMANDS.DELETE_ACCOUNT_DATA, {
      dataDirectory: pending.dataDirectory,
    });
    removeAccount(pending.id);
  }, [pendingRemoval, removeAccount]);

  const cancelRemoval = useCallback(() => {
    setPendingRemoval(null);
  }, []);

  return {
    accounts,
    startAddAccount,
    removeAccount: requestRemoveAccount,
    pendingAccountName,
    submitAccountName,
    cancelAccountName,
    pendingRemoval,
    confirmRemoval,
    cancelRemoval,
  };
}

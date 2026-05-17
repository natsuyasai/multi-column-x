// src/hooks/useAccounts.ts
import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/useAppStore";
import type { Account } from "../types";
import { IPC_COMMANDS, IPC_EVENTS } from "../constants/ipc";

const ACCOUNT_COLORS = [
  "#1d9bf0",
  "#e5c07b",
  "#98c379",
  "#c678dd",
  "#e06c75",
  "#61afef",
  "#56b6c2",
  "#abb2bf",
];

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

async function createAccountFromResult(
  accountId: string,
  dataDirectory: string,
  windowLabel: string,
  addAccount: (account: Account) => void,
): Promise<void> {
  const currentAccounts = useAppStore.getState().accounts;
  const label =
    prompt("このアカウントの名前を入力してください") ??
    `アカウント ${currentAccounts.length + 1}`;
  const color = ACCOUNT_COLORS[currentAccounts.length % ACCOUNT_COLORS.length];

  const account: Account = {
    id: accountId,
    label,
    dataDirectory,
    color,
    createdAt: new Date().toISOString(),
  };

  addAccount(account);
  await invoke(IPC_COMMANDS.CLOSE_WINDOW, { label: windowLabel }).catch(
    () => {},
  );
}

export function useAccounts() {
  const { accounts, addAccount, removeAccount, isMobile } = useAppStore();
  const isAddingRef = useRef(false);

  const startAddAccount = useCallback(async () => {
    if (isAddingRef.current) return;
    isAddingRef.current = true;

    try {
      if (isMobile) {
        // -----------------------------------------------
        // mobile 専用フロー
        // -----------------------------------------------
        // open_add_account_window は AddAccount Activity が終了するまでブロックする。
        // JavaScript は WebView が suspend 中に一時停止し、
        // AddAccount が finish() して MainActivity が前面に戻った時点で再開する。
        // 成功: resolve → アカウント名入力へ
        // キャンセル（バックボタン）: reject → 何もしない
        const raw = await invoke<string>(IPC_COMMANDS.OPEN_ADD_ACCOUNT_WINDOW);
        const parsed = parseAddAccountResult(raw);
        await createAccountFromResult(
          parsed.accountId,
          parsed.dataDirectory,
          parsed.windowLabel,
          addAccount,
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

          listen<void>(IPC_EVENTS.ACCOUNT_LOGIN_COMPLETE, async () => {
            cleanup();
            await createAccountFromResult(
              accountId,
              dataDirectory,
              windowLabel,
              addAccount,
            );
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
  }, [addAccount, isMobile]);

  const handleRemoveAccount = useCallback(
    async (id: string) => {
      const account = accounts.find((a) => a.id === id);
      if (!account) return;

      const confirmed = confirm(
        `「${account.label}」を削除しますか？セッションデータも削除されます。`,
      );
      if (!confirmed) return;

      await invoke(IPC_COMMANDS.DELETE_ACCOUNT_DATA, {
        dataDirectory: account.dataDirectory,
      });
      removeAccount(id);
    },
    [accounts, removeAccount],
  );

  return { accounts, startAddAccount, removeAccount: handleRemoveAccount };
}

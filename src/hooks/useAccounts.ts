// src/hooks/useAccounts.ts
import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/useAppStore";
import type { Account } from "../types";

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
  const color =
    ACCOUNT_COLORS[currentAccounts.length % ACCOUNT_COLORS.length];

  const account: Account = {
    id: accountId,
    label,
    dataDirectory,
    color,
    createdAt: new Date().toISOString(),
  };

  addAccount(account);
  await invoke("close_window", { label: windowLabel }).catch(() => {});
}

export function useAccounts() {
  const { accounts, addAccount, removeAccount, isMobile } = useAppStore();
  const isAddingRef = useRef(false);
  const pendingCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      pendingCleanupRef.current?.();
      pendingCleanupRef.current = null;
    };
  }, []);

  const startAddAccount = useCallback(async () => {
    if (isAddingRef.current) return;
    isAddingRef.current = true;

    try {
      const result = await invoke<string>("open_add_account_window");
      let parsed: {
        accountId: string;
        dataDirectory: string;
        windowLabel: string;
      };
      try {
        parsed = JSON.parse(result);
      } catch {
        throw new Error("Failed to parse open_add_account_window response");
      }
      const { accountId, dataDirectory, windowLabel } = parsed;

      await new Promise<void>((resolve, reject) => {
        let unlistenLogin: (() => void) | null = null;
        let unlistenDestroyed: (() => void) | null = null;
        let unlistenVisibility: (() => void) | null = null;

        const cleanup = () => {
          unlistenLogin?.();
          unlistenLogin = null;
          unlistenDestroyed?.();
          unlistenDestroyed = null;
          unlistenVisibility?.();
          unlistenVisibility = null;
          pendingCleanupRef.current = null;
        };

        // account-login-complete イベント（desktop 主系 / mobile 副系）
        // desktop: Rust URL ポーリングが検出して emit
        // mobile:  mark_login_complete が close 成功後に delayed emit
        listen<void>("account-login-complete", async () => {
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
            pendingCleanupRef.current = cleanup;
          })
          .catch(reject);

        if (isMobile) {
          // mobile 主系: AddAccount Activity が閉じると MainActivity が
          // フォアグラウンドに戻り visibilitychange が発火する。
          // check_login_complete で init script が呼んだ mark_login_complete の
          // フラグを確認してアカウント追加を完了する。
          const handleVisibilityChange = async () => {
            if (document.visibilityState !== "visible") return;
            cleanup();
            const loginCompleted =
              await invoke<boolean>("check_login_complete").catch(() => false);
            if (loginCompleted) {
              await createAccountFromResult(
                accountId,
                dataDirectory,
                windowLabel,
                addAccount,
              );
              resolve();
            } else {
              reject(new Error("Login cancelled"));
            }
          };
          document.addEventListener("visibilitychange", handleVisibilityChange);
          unlistenVisibility = () =>
            document.removeEventListener(
              "visibilitychange",
              handleVisibilityChange,
            );
        } else {
          // desktop: ログインウィンドウを閉じたことを検出（ユーザーがキャンセル）
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
        }
      });
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

      await invoke("delete_account_data", {
        dataDirectory: account.dataDirectory,
      });
      removeAccount(id);
    },
    [accounts, removeAccount],
  );

  return { accounts, startAddAccount, removeAccount: handleRemoveAccount };
}

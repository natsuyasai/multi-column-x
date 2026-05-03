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

export function useAccounts() {
  const { accounts, addAccount, removeAccount } = useAppStore();
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

        const cleanup = () => {
          unlistenLogin?.();
          unlistenLogin = null;
          unlistenDestroyed?.();
          unlistenDestroyed = null;
          pendingCleanupRef.current = null;
        };

        // Listen for successful login
        listen<void>("account-login-complete", async () => {
          cleanup();

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
          resolve();
        })
          .then((fn) => {
            unlistenLogin = fn;
            pendingCleanupRef.current = cleanup;
          })
          .catch(reject);

        // Detect login window closed without completing login (user abandoned)
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
    } finally {
      isAddingRef.current = false;
    }
  }, [addAccount]);

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

// src/hooks/useAccounts.ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useRef, useState } from "react";
import { ACCOUNT_COLORS } from "../constants/accountColors";
import { IPC_COMMANDS, IPC_EVENTS } from "../constants/ipc";
import { evaluateReauthIdentity } from "../lib/reauthIdentity";
import { useAppStore } from "../store/useAppStore";
import type { Account } from "../types";

interface AccountWindowResult {
  accountId: string;
  dataDirectory: string;
  windowLabel: string;
}

interface ReauthCompletePayload {
  accountId: string;
  xUserId: string | null;
}

function parseAccountWindowResult(raw: string): AccountWindowResult {
  try {
    return JSON.parse(raw) as AccountWindowResult;
  } catch {
    throw new Error("Failed to parse account window response");
  }
}

const REAUTH_FAILED_MESSAGE =
  "再認証に失敗しました（アカウント識別子を取得できませんでした）";
const REAUTH_MISMATCH_MESSAGE =
  "登録済みと異なるアカウントでログインされたため、セッションを更新しませんでした";
const REAUTH_SKIP_MESSAGE =
  "初回の再認証のため同一性の照合をスキップし、アカウント識別子を記録しました";

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

export function useAccounts(reloadAllWebviews?: () => void | Promise<void>) {
  const { accounts, addAccount, removeAccount, updateAccount, isMobile } =
    useAppStore();
  const isAddingRef = useRef(false);
  const isReauthingRef = useRef(false);
  const [pendingAccountName, setPendingAccountName] =
    useState<PendingAccountName | null>(null);
  const [pendingRemoval, setPendingRemoval] =
    useState<PendingAccountRemoval | null>(null);
  const [reauthNotice, setReauthNotice] = useState<string | null>(null);

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
        const parsed = parseAccountWindowResult(raw);
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
          parseAccountWindowResult(raw);

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

  const dismissReauthNotice = useCallback(() => {
    setReauthNotice(null);
  }, []);

  const startReauth = useCallback(
    async (accountId: string) => {
      if (isReauthingRef.current) return;
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;

      isReauthingRef.current = true;
      try {
        if (isMobile) {
          // -----------------------------------------------
          // mobile 専用フロー
          // -----------------------------------------------
          // reauth_account_window は AddAccount Activity（reauth モード）が
          // 終了するまでブロックする。Kotlin 側で twid 照合済みのため、
          // ここでは skip 通知の要否だけ evaluateReauthIdentity で判定する。
          const raw = await invoke<string>(IPC_COMMANDS.REAUTH_ACCOUNT_WINDOW, {
            accountId,
            dataDirectory: account.dataDirectory,
            expectedUserId: account.xUserId ?? null,
          });
          const payload = JSON.parse(raw) as ReauthCompletePayload;
          const xUserId = payload.xUserId;
          if (!xUserId) {
            setReauthNotice(REAUTH_FAILED_MESSAGE);
            return;
          }

          const verdict = evaluateReauthIdentity(account.xUserId, xUserId);
          updateAccount(accountId, { xUserId });
          await reloadAllWebviews?.();
          if (verdict === "skip") {
            setReauthNotice(REAUTH_SKIP_MESSAGE);
          }
          return;
        }

        const raw = await invoke<string>(IPC_COMMANDS.REAUTH_ACCOUNT_WINDOW, {
          accountId,
          dataDirectory: account.dataDirectory,
        });
        const { windowLabel } = parseAccountWindowResult(raw);

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let unlistenComplete: (() => void) | null = null;
          let unlistenDestroyed: (() => void) | null = null;

          const cleanup = () => {
            unlistenComplete?.();
            unlistenComplete = null;
            unlistenDestroyed?.();
            unlistenDestroyed = null;
          };

          const closeReauthWindow = () => {
            invoke(IPC_COMMANDS.CLOSE_WINDOW, { label: windowLabel }).catch(
              () => {},
            );
          };

          const handleComplete = async (xUserId: string | null) => {
            if (!xUserId) {
              setReauthNotice(REAUTH_FAILED_MESSAGE);
              closeReauthWindow();
              resolve();
              return;
            }

            const verdict = evaluateReauthIdentity(account.xUserId, xUserId);
            if (verdict === "mismatch") {
              setReauthNotice(REAUTH_MISMATCH_MESSAGE);
              closeReauthWindow();
              resolve();
              return;
            }

            updateAccount(accountId, { xUserId });
            closeReauthWindow();
            await reloadAllWebviews?.();
            if (verdict === "skip") {
              setReauthNotice(REAUTH_SKIP_MESSAGE);
            }
            resolve();
          };

          listen<ReauthCompletePayload>(
            IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE,
            (event) => {
              if (settled || event.payload.accountId !== accountId) return;
              settled = true;
              cleanup();
              void handleComplete(event.payload.xUserId);
            },
          )
            .then((fn) => {
              unlistenComplete = fn;
            })
            .catch(reject);

          // 再認証ウィンドウを閉じたことを検出（ユーザーがキャンセル）
          import("@tauri-apps/api/webviewWindow")
            .then(({ WebviewWindow }) => {
              WebviewWindow.getByLabel(windowLabel)
                .then((reauthWindow) => {
                  if (!reauthWindow) return;
                  reauthWindow
                    .once("tauri://destroyed", () => {
                      if (settled) return;
                      settled = true;
                      cleanup();
                      resolve();
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
      } catch (e) {
        // mobile: Kotlin 側で不一致と判定された場合は Rust が "account-mismatch" で reject する。
        // それ以外（cancelled/timeout、desktop のウィンドウclose）はエラー表示不要。
        if (isMobile && String(e).includes("account-mismatch")) {
          setReauthNotice(REAUTH_MISMATCH_MESSAGE);
        }
      } finally {
        isReauthingRef.current = false;
      }
    },
    [accounts, isMobile, reloadAllWebviews, updateAccount],
  );

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
    startReauth,
    reauthNotice,
    dismissReauthNotice,
  };
}

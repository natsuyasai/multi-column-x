// src/hooks/useAccounts.ts
import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import type { Account } from '../types';

const ACCOUNT_COLORS = [
  '#1d9bf0', '#e5c07b', '#98c379', '#c678dd',
  '#e06c75', '#61afef', '#56b6c2', '#abb2bf',
];

export function useAccounts() {
  const { accounts, addAccount, removeAccount } = useAppStore();

  const startAddAccount = useCallback(async () => {
    const result = await invoke<string>('open_add_account_window');
    let parsed: { accountId: string; dataDirectory: string; windowLabel: string };
    try {
      parsed = JSON.parse(result);
    } catch {
      throw new Error('Failed to parse open_add_account_window response');
    }
    const { accountId, dataDirectory, windowLabel } = parsed;

    return new Promise<void>((resolve, reject) => {
      let unlistenFn: (() => void) | null = null;
      const isAdding = { current: true };

      listen<void>('account-login-complete', async () => {
        if (!isAdding.current) return;
        isAdding.current = false;
        unlistenFn?.();

        const currentAccounts = useAppStore.getState().accounts;
        const label = prompt('このアカウントの名前を入力してください') ?? `アカウント ${currentAccounts.length + 1}`;
        const color = ACCOUNT_COLORS[currentAccounts.length % ACCOUNT_COLORS.length];

        const account: Account = {
          id: accountId,
          label,
          dataDirectory,
          color,
          createdAt: new Date().toISOString(),
        };

        addAccount(account);
        await invoke('close_window', { label: windowLabel }).catch(() => {});
        resolve();
      }).then((fn) => {
        unlistenFn = fn;
        if (!isAdding.current) fn(); // already resolved, clean up immediately
      }).catch(reject);
    });
  }, [addAccount]);

  const handleRemoveAccount = useCallback(async (id: string) => {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;

    const confirmed = confirm(`「${account.label}」を削除しますか？セッションデータも削除されます。`);
    if (!confirmed) return;

    await invoke('delete_account_data', { dataDirectory: account.dataDirectory });
    removeAccount(id);
  }, [accounts, removeAccount]);

  return { accounts, startAddAccount, removeAccount: handleRemoveAccount };
}

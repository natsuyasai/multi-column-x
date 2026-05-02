// src/hooks/useAccounts.ts
import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Account } from '../types';

const ACCOUNT_COLORS = [
  '#1d9bf0', '#e5c07b', '#98c379', '#c678dd',
  '#e06c75', '#61afef', '#56b6c2', '#abb2bf',
];

export function useAccounts() {
  const { accounts, addAccount, removeAccount } = useAppStore();

  useEffect(() => {
    const unlisten = listen<void>('account-login-complete', () => {
      // ログイン完了時にフロントエンドがaddPendingAccountを呼び出す
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const startAddAccount = useCallback(async () => {
    const result = await invoke<string>('open_add_account_window');
    const { accountId, dataDirectory, windowLabel } = JSON.parse(result);

    // ログイン完了を待つ
    return new Promise<void>((resolve) => {
      const unlisten = listen<void>('account-login-complete', async () => {
        unlisten.then((fn) => fn());

        const label = prompt('このアカウントの名前を入力してください') ?? `アカウント ${accounts.length + 1}`;
        const color = ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length];

        const account: Account = {
          id: accountId,
          label,
          dataDirectory,
          color,
          createdAt: new Date().toISOString(),
        };

        addAccount(account);

        // ログインウィンドウを閉じる
        await invoke('close_window', { label: windowLabel }).catch(() => {});
        resolve();
      });
    });
  }, [accounts, addAccount]);

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

// src/App.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import { useColumns } from './hooks/useColumns';
import { useAccounts } from './hooks/useAccounts';
import { ColumnHeader } from './components/ColumnHeader/ColumnHeader';
import { AddColumnDialog } from './components/AddColumnDialog/AddColumnDialog';
import { AccountManager } from './components/AccountManager/AccountManager';
import { invoke } from '@tauri-apps/api/core';
import styles from './App.module.scss';

const App: React.FC = () => {
  const { loadSettings, isLoaded, accounts } = useAppStore();
  const {
    columns,
    containerRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
  } = useColumns();
  const { startAddAccount, removeAccount } = useAccounts();

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);

  useEffect(() => {
    loadSettings().then(() => {
      restoreColumns();
    });
  }, []);

  const handleReload = useCallback(async (columnId: string) => {
    const webviewLabel = `column-${columnId}`;
    await invoke('eval_in_webview', { label: webviewLabel, script: 'window.location.reload();' })
      .catch(console.error);
  }, []);

  if (!isLoaded) {
    return (
      <div className={styles.loading}>
        <span>読み込み中...</span>
      </div>
    );
  }

  return (
    <div className={styles.app} ref={containerRef}>
      <div className={styles.headerRow}>
        <div className={styles.columnHeaders}>
          {columns
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((column) => {
              const account = accounts.find((a) => a.id === column.accountId);
              if (!account) return null;
              return (
                <div
                  key={column.id}
                  style={{ width: column.width, flexShrink: 0 }}
                >
                  <ColumnHeader
                    column={column}
                    account={account}
                    onReload={handleReload}
                    onSettings={() => {}}
                    onClose={handleRemoveColumn}
                  />
                </div>
              );
            })}
        </div>

        <div className={styles.toolbar}>
          <button
            className={styles.toolbarBtn}
            onClick={() => setShowAddColumn(true)}
            title="カラムを追加"
            aria-label="カラムを追加"
          >
            +
          </button>
          <button
            className={styles.toolbarBtn}
            onClick={() => setShowAccountManager(true)}
            title="アカウント管理"
            aria-label="アカウント管理"
          >
            👤
          </button>
        </div>
      </div>

      <div className={styles.webviewArea} />

      {showAddColumn && accounts.length > 0 && (
        <AddColumnDialog
          accounts={accounts}
          onAdd={(column) => {
            handleAddColumn(column);
            setShowAddColumn(false);
          }}
          onCancel={() => setShowAddColumn(false)}
        />
      )}

      {showAddColumn && accounts.length === 0 && (
        <div className={styles.noAccountsPrompt}>
          <p>先にアカウントを追加してください</p>
          <button onClick={() => { setShowAddColumn(false); setShowAccountManager(true); }}>
            アカウント管理を開く
          </button>
        </div>
      )}

      {showAccountManager && (
        <AccountManager
          accounts={accounts}
          onAddAccount={startAddAccount}
          onRemoveAccount={removeAccount}
          onClose={() => setShowAccountManager(false)}
        />
      )}
    </div>
  );
};

export default App;

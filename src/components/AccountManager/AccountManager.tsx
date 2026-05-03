import React from 'react';
import type { Account } from '../../types';
import styles from './AccountManager.module.scss';

interface AccountManagerProps {
  accounts: Account[];
  defaultAccountId?: string;
  onAddAccount: () => void;
  onRemoveAccount: (id: string) => void;
  onSetDefault: (id: string) => void;
  onClose: () => void;
}

export const AccountManager: React.FC<AccountManagerProps> = ({
  accounts,
  defaultAccountId,
  onAddAccount,
  onRemoveAccount,
  onSetDefault,
  onClose,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>アカウント管理</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        <div className={styles.list}>
          {accounts.length === 0 && (
            <p className={styles.empty}>アカウントがありません</p>
          )}
          {accounts.map((account) => {
            const isDefault = account.id === defaultAccountId || (!defaultAccountId && accounts[0]?.id === account.id);
            return (
              <div key={account.id} className={styles.item}>
                <span
                  className={styles.dot}
                  style={{ backgroundColor: account.color }}
                />
                <span className={styles.label}>{account.label}</span>
                <button
                  className={`${styles.defaultBtn}${isDefault ? ` ${styles.defaultBtnActive}` : ''}`}
                  onClick={() => onSetDefault(account.id)}
                  title="ツイート時のデフォルトアカウントに設定"
                  aria-label={`${account.label} をデフォルトに設定`}
                >
                  {isDefault ? '★' : '☆'}
                </button>
                <button
                  className={styles.removeBtn}
                  onClick={() => onRemoveAccount(account.id)}
                  aria-label={`${account.label} を削除`}
                >
                  削除
                </button>
              </div>
            );
          })}
        </div>

        <button className={styles.addBtn} onClick={onAddAccount}>
          + アカウントを追加
        </button>
      </div>
    </div>
  );
};

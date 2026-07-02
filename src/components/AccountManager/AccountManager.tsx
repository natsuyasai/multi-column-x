import React, { useState } from "react";
import CloseIcon from "../../assets/icons/close.svg?react";
import StarOutlineIcon from "../../assets/icons/star-outline.svg?react";
import StarIcon from "../../assets/icons/star.svg?react";
import { ACCOUNT_COLORS } from "../../constants/accountColors";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { Account } from "../../types";
import styles from "./AccountManager.module.scss";

interface AccountManagerProps {
  accounts: Account[];
  defaultAccountId?: string;
  onAddAccount: () => void;
  onRemoveAccount: (id: string) => void;
  onSetDefault: (id: string) => void;
  onUpdateAccount: (
    id: string,
    patch: Partial<Pick<Account, "label" | "color">>,
  ) => void;
  onClose: () => void;
}

export const AccountManager: React.FC<AccountManagerProps> = ({
  accounts,
  defaultAccountId,
  onAddAccount,
  onRemoveAccount,
  onSetDefault,
  onUpdateAccount,
  onClose,
}) => {
  useEscapeKey(onClose);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const startEditing = (account: Account) => {
    setEditingId(account.id);
    setDraftLabel(account.label);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftLabel("");
  };

  const saveEditing = (id: string) => {
    const trimmed = draftLabel.trim();
    if (trimmed) {
      onUpdateAccount(id, { label: trimmed });
    }
    setEditingId(null);
    setDraftLabel("");
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>アカウント管理</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="閉じる"
          >
            <CloseIcon width={16} height={16} data-testid="icon-close" />
          </button>
        </div>

        <div className={styles.list}>
          {accounts.length === 0 && (
            <p className={styles.empty}>アカウントがありません</p>
          )}
          {accounts.map((account) => {
            const isDefault =
              account.id === defaultAccountId ||
              (!defaultAccountId && accounts[0]?.id === account.id);
            const isEditing = editingId === account.id;

            if (isEditing) {
              return (
                <div key={account.id} className={styles.item}>
                  <div className={styles.editForm}>
                    <label
                      className={styles.editLabel}
                      htmlFor="account-name-edit-input"
                    >
                      アカウント名
                    </label>
                    <input
                      id="account-name-edit-input"
                      className={styles.editInput}
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                    />
                    <div className={styles.colorSwatches}>
                      {ACCOUNT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`${styles.colorSwatch}${account.color === color ? ` ${styles.colorSwatchActive}` : ""}`}
                          style={{ backgroundColor: color }}
                          onClick={() => onUpdateAccount(account.id, { color })}
                          aria-label={`色を ${color} に変更`}
                        />
                      ))}
                    </div>
                    <div className={styles.editActions}>
                      <button
                        type="button"
                        className={styles.cancelEditBtn}
                        onClick={cancelEditing}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        className={styles.saveEditBtn}
                        onClick={() => saveEditing(account.id)}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={account.id} className={styles.item}>
                <span
                  className={styles.dot}
                  style={{ backgroundColor: account.color }}
                />
                <span className={styles.label}>{account.label}</span>
                <button
                  className={styles.editBtn}
                  onClick={() => startEditing(account)}
                  aria-label={`${account.label} を編集`}
                >
                  編集
                </button>
                <button
                  className={`${styles.defaultBtn}${isDefault ? ` ${styles.defaultBtnActive}` : ""}`}
                  onClick={() => onSetDefault(account.id)}
                  title="ツイート時のデフォルトアカウントに設定"
                  aria-label={`${account.label} をデフォルトに設定`}
                >
                  {isDefault ? (
                    <StarIcon width={16} height={16} data-testid="icon-star" />
                  ) : (
                    <StarOutlineIcon
                      width={16}
                      height={16}
                      data-testid="icon-star-outline"
                    />
                  )}
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

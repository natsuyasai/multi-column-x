import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  onReauthAccount: (id: string) => void;
}

export const AccountManager: React.FC<AccountManagerProps> = ({
  accounts,
  defaultAccountId,
  onAddAccount,
  onRemoveAccount,
  onSetDefault,
  onUpdateAccount,
  onClose,
  onReauthAccount,
}) => {
  const { t } = useTranslation();
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
          <h2 className={styles.title}>{t("accounts:manager.title")}</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t("accounts:manager.close")}
          >
            <CloseIcon width={16} height={16} data-testid="icon-close" />
          </button>
        </div>

        <div className={styles.list}>
          {accounts.length === 0 && (
            <p className={styles.empty}>{t("accounts:manager.empty")}</p>
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
                      {t("accounts:manager.nameLabel")}
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
                          aria-label={t("accounts:manager.changeColor", {
                            color,
                          })}
                        />
                      ))}
                    </div>
                    <div className={styles.editActions}>
                      <button
                        type="button"
                        className={styles.cancelEditBtn}
                        onClick={cancelEditing}
                      >
                        {t("accounts:manager.cancel")}
                      </button>
                      <button
                        type="button"
                        className={styles.saveEditBtn}
                        onClick={() => saveEditing(account.id)}
                      >
                        {t("accounts:manager.save")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={account.id} className={styles.item}>
                <div className={styles.summary}>
                  <span
                    className={styles.dot}
                    style={{ backgroundColor: account.color }}
                  />
                  <span className={styles.label}>{account.label}</span>
                  <button
                    className={`${styles.defaultBtn}${isDefault ? ` ${styles.defaultBtnActive}` : ""}`}
                    onClick={() => onSetDefault(account.id)}
                    title={t("accounts:manager.setDefaultTitle")}
                    aria-label={t("accounts:manager.setDefault", {
                      label: account.label,
                    })}
                  >
                    {isDefault ? (
                      <StarIcon
                        width={16}
                        height={16}
                        data-testid="icon-star"
                      />
                    ) : (
                      <StarOutlineIcon
                        width={16}
                        height={16}
                        data-testid="icon-star-outline"
                      />
                    )}
                  </button>
                </div>
                <div className={styles.actions}>
                  <button
                    className={styles.editBtn}
                    onClick={() => startEditing(account)}
                    aria-label={t("accounts:manager.editAria", {
                      label: account.label,
                    })}
                  >
                    {t("accounts:manager.edit")}
                  </button>
                  <button
                    className={styles.editBtn}
                    onClick={() => onReauthAccount(account.id)}
                    aria-label={t("accounts:manager.reauthAria", {
                      label: account.label,
                    })}
                  >
                    {t("accounts:manager.reauth")}
                  </button>
                  <button
                    className={styles.removeBtn}
                    onClick={() => onRemoveAccount(account.id)}
                    aria-label={t("accounts:manager.removeAria", {
                      label: account.label,
                    })}
                  >
                    {t("accounts:manager.remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button className={styles.addBtn} onClick={onAddAccount}>
          {t("accounts:manager.add")}
        </button>
      </div>
    </div>
  );
};

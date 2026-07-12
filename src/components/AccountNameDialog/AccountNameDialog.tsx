import React, { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import styles from "./AccountNameDialog.module.scss";

interface AccountNameDialogProps {
  defaultValue: string;
  title: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export const AccountNameDialog: React.FC<AccountNameDialogProps> = ({
  defaultValue,
  title,
  onSubmit,
  onCancel,
}) => {
  useEscapeKey(onCancel);

  const [name, setName] = useState(defaultValue);
  const trimmed = name.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className={styles.overlay}>
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 className={styles.title}>{title}</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="account-name-input">
            アカウント名
          </label>
          <input
            id="account-name-input"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!trimmed}
          >
            OK
          </button>
        </div>
      </form>
    </div>
  );
};

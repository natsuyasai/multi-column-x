import React, { useState } from "react";
import type { Account } from "../../types";
import styles from "./ComposeTweetDialog.module.scss";

interface ComposeTweetDialogProps {
  accounts: Account[];
  defaultAccountId: string;
  onSubmit: (accountId: string) => void;
  onClose: () => void;
}

export const ComposeTweetDialog: React.FC<ComposeTweetDialogProps> = ({
  accounts,
  defaultAccountId,
  onSubmit,
  onClose,
}) => {
  const [accountId, setAccountId] = useState(defaultAccountId);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h3>ツイートするアカウントを選択</h3>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          autoFocus
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            キャンセル
          </button>
          <button className={styles.okBtn} onClick={() => onSubmit(accountId)}>
            ツイート
          </button>
        </div>
      </div>
    </div>
  );
};

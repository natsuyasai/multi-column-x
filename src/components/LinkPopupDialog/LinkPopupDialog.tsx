import React, { useState } from "react";
import type { Account } from "../../types";
import styles from "./LinkPopupDialog.module.scss";

interface LinkPopupDialogProps {
  accounts: Account[];
  defaultAccountId: string;
  onSubmit: (url: string, accountId: string) => void;
  onClose: () => void;
}

export const LinkPopupDialog: React.FC<LinkPopupDialogProps> = ({
  accounts,
  defaultAccountId,
  onSubmit,
  onClose,
}) => {
  const [url, setUrl] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId);

  const handleSubmit = () => {
    onSubmit(url, accountId);
    setUrl("");
  };

  const handleCancel = () => {
    setUrl("");
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h3>URLをポップアップウィンドウで開く</h3>
        <input
          type="text"
          placeholder="https://x.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") handleCancel();
          }}
          autoFocus
        />
        {accounts.length > 1 && (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={handleCancel}>
            キャンセル
          </button>
          <button className={styles.okBtn} onClick={handleSubmit}>
            開く
          </button>
        </div>
      </div>
    </div>
  );
};

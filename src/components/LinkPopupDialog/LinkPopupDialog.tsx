import React, { useState, useRef, useEffect } from "react";
import type { Account } from "../../types";
import styles from "./LinkPopupDialog.module.scss";

interface LinkPopupDialogProps {
  accounts: Account[];
  defaultAccountId: string;
  onSubmit: (url: string, accountId: string) => void;
  onClose: () => void;
  /** 指定時はURL入力欄を隠し、常にこのURLで送信する（公式設定を開く用途など） */
  fixedUrl?: string;
  /** ダイアログタイトル（省略時は既存の "URLをポップアップウィンドウで開く"） */
  title?: string;
}

export const LinkPopupDialog: React.FC<LinkPopupDialogProps> = ({
  accounts,
  defaultAccountId,
  onSubmit,
  onClose,
  fixedUrl,
  title,
}) => {
  const [url, setUrl] = useState(fixedUrl ?? "");
  const [accountId, setAccountId] = useState(defaultAccountId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    onSubmit(fixedUrl ?? url, accountId);
    setUrl("");
  };

  const handleCancel = () => {
    setUrl("");
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h3>{title ?? "URLをポップアップウィンドウで開く"}</h3>
        {!fixedUrl && (
          <input
            ref={inputRef}
            type="text"
            placeholder="https://x.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") handleCancel();
            }}
          />
        )}
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

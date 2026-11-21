import React, { useState, useRef, useEffect, useId } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useRestoreFocus } from "../../hooks/useRestoreFocus";
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
  const { t } = useTranslation();
  const [url, setUrl] = useState(fixedUrl ?? "");
  const [accountId, setAccountId] = useState(defaultAccountId);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useRestoreFocus();

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

  useEscapeKey(handleCancel);

  return (
    <div className={styles.overlay}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId}>{title ?? t("dialogs:linkPopup.defaultTitle")}</h3>
        {!fixedUrl && (
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            aria-label={t("dialogs:linkPopup.urlLabel")}
            placeholder={t("dialogs:linkPopup.urlPlaceholder")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        )}
        {accounts.length > 1 && (
          <select
            className={styles.select}
            aria-label={t("dialogs:linkPopup.accountLabel")}
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
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={handleCancel}
          >
            {t("dialogs:linkPopup.cancel")}
          </button>
          <button type="button" className={styles.okBtn} onClick={handleSubmit}>
            {t("dialogs:linkPopup.open")}
          </button>
        </div>
      </div>
    </div>
  );
};

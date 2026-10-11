import React from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import styles from "./ConfirmDialog.module.scss";

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  singleButton?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  singleButton = false,
}) => {
  const { t } = useTranslation();
  useEscapeKey(onCancel);

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        {title && <h2 className={styles.title}>{title}</h2>}
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          {!singleButton && (
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
            >
              {cancelLabel ?? t("dialogs:confirm.cancel")}
            </button>
          )}
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={onConfirm}
          >
            {confirmLabel ?? t("dialogs:confirm.ok")}
          </button>
        </div>
      </div>
    </div>
  );
};

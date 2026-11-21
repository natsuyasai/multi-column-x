import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useRestoreFocus } from "../../hooks/useRestoreFocus";
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
  useRestoreFocus();
  const titleId = useId();
  const messageId = useId();

  return (
    <div className={styles.overlay}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : messageId}
        aria-describedby={title ? messageId : undefined}
      >
        {title && (
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        )}
        <p id={messageId} className={styles.message}>
          {message}
        </p>

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

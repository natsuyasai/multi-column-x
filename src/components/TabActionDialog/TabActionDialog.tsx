import React, { useEffect } from "react";
import CloseIcon from "../../assets/icons/close.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import styles from "./TabActionDialog.module.scss";

interface Props {
  columnLabel: string;
  onReload: () => void;
  onSettings: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export const TabActionDialog: React.FC<Props> = ({
  columnLabel,
  onReload,
  onSettings,
  onRemove,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className={styles.sheet} role="dialog" aria-modal="true">
        <p className={styles.label}>{columnLabel}</p>
        <button className={styles.actionBtn} onClick={onReload}>
          <span aria-hidden="true">⟳</span>
          再読み込み
        </button>
        <button className={styles.actionBtn} onClick={onSettings}>
          <SettingsIcon width={16} height={16} data-testid="icon-settings" />
          設定
        </button>
        <button
          className={`${styles.actionBtn} ${styles.dangerBtn}`}
          onClick={onRemove}
        >
          <CloseIcon width={16} height={16} data-testid="icon-close" />
          削除
        </button>
        <button className={styles.cancelBtn} onClick={onClose}>
          キャンセル
        </button>
      </div>
    </div>
  );
};

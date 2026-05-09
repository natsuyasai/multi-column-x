import React from "react";
import styles from "./TabActionDialog.module.scss";

interface Props {
  columnLabel: string;
  onSettings: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export const TabActionDialog: React.FC<Props> = ({
  columnLabel,
  onSettings,
  onRemove,
  onClose,
}) => {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <p className={styles.label}>{columnLabel}</p>
        <button className={styles.actionBtn} onClick={onSettings}>
          ⚙ 設定
        </button>
        <button
          className={`${styles.actionBtn} ${styles.dangerBtn}`}
          onClick={onRemove}
        >
          ✕ 削除
        </button>
        <button className={styles.cancelBtn} onClick={onClose}>
          キャンセル
        </button>
      </div>
    </div>
  );
};

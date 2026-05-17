import React from "react";
import type { Account, Column } from "../../types";
import { getPageTypeLabel } from "../../types";
import { useAutoReload } from "../../hooks/useAutoReload";
import styles from "./ColumnHeader.module.scss";

interface ColumnHeaderProps {
  column: Column;
  account: Account;
  onReload: (columnId: string) => void;
  onMoveLeft: (columnId: string) => void;
  onMoveRight: (columnId: string) => void;
  onSettings: (columnId: string) => void;
  onClose: (columnId: string) => void;
  isFirst: boolean;
  isLast: boolean;
  showSortButtons: boolean;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  column,
  account,
  onReload,
  onMoveLeft,
  onMoveRight,
  onSettings,
  onClose,
  isFirst,
  isLast,
  showSortButtons,
}) => {
  const label =
    column.label ?? `${account.label} - ${getPageTypeLabel(column)}`;
  const { remaining, reset } = useAutoReload({
    columnId: column.id,
    enabled: column.settings.autoReloadEnabled,
    intervalSec: column.settings.autoReloadInterval,
  });

  const showCountdown = column.settings.showCountdown && remaining !== null;

  return (
    <div className={styles.header} style={{ borderTopColor: account.color }}>
      <span className={styles.dot} style={{ backgroundColor: account.color }} />
      <span className={styles.label}>{label}</span>
      {showCountdown && (
        <span className={styles.countdown} title="次の自動更新まで">
          {remaining}s
        </span>
      )}
      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={() => {
            onReload(column.id);
            reset();
          }}
          aria-label="更新"
          title="更新"
        >
          ↺
        </button>
        {showSortButtons && (
          <>
            <button
              className={styles.actionBtn}
              onClick={() => onMoveLeft(column.id)}
              disabled={isFirst}
              aria-label="左に移動"
              title="左に移動"
            >
              ←
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => onMoveRight(column.id)}
              disabled={isLast}
              aria-label="右に移動"
              title="右に移動"
            >
              →
            </button>
          </>
        )}
        <button
          className={styles.actionBtn}
          onClick={() => onSettings(column.id)}
          aria-label="設定"
          title="設定"
        >
          ⚙
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => onClose(column.id)}
          aria-label="カラムを閉じる"
          title="カラムを閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

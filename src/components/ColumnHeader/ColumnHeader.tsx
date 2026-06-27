import React from "react";
import CloseIcon from "../../assets/icons/close.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import { useAutoReload } from "../../hooks/useAutoReload";
import type { Account, Column } from "../../types";
import { getPageTypeLabel } from "../../types";
import styles from "./ColumnHeader.module.scss";

interface ColumnHeaderProps {
  column: Column;
  account: Account;
  onReload: (columnId: string) => void;
  onReloadPage: (columnId: string) => void;
  onSettings: (columnId: string) => void;
  onClose: (columnId: string) => void;
  unreadCount?: number;
  onClearUnread?: (columnId: string) => void;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  column,
  account,
  onReload,
  onReloadPage,
  onSettings,
  onClose,
  unreadCount = 0,
  onClearUnread,
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
      {unreadCount > 0 && (
        <button
          className={styles.unreadBadge}
          data-testid="unread-badge"
          onClick={() => onClearUnread?.(column.id)}
          title="未読をクリア"
        >
          {unreadCount}
        </button>
      )}
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
        <button
          className={styles.actionBtn}
          onClick={() => {
            onReloadPage(column.id);
            reset();
          }}
          aria-label="ページを再読み込み"
          title="ページを再読み込み"
        >
          ⟳
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => onSettings(column.id)}
          aria-label="設定"
          title="設定"
        >
          <SettingsIcon width={14} height={14} data-testid="icon-settings" />
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => onClose(column.id)}
          aria-label="カラムを閉じる"
          title="カラムを閉じる"
        >
          <CloseIcon width={14} height={14} data-testid="icon-close" />
        </button>
      </div>
    </div>
  );
};

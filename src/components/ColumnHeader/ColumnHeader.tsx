import React from "react";
import { useTranslation } from "react-i18next";
import type { AppTFunction } from "@/i18n/types";
import { isAutoReloadSupported } from "@/lib/autoReloadTarget";
import ChevronsUpIcon from "../../assets/icons/chevrons-up.svg?react";
import CloseIcon from "../../assets/icons/close.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import { useAutoReload } from "../../hooks/useAutoReload";
import type { Account, Column } from "../../types";
import { getPageTypeLabel } from "../../types";
import styles from "./ColumnHeader.module.scss";

function resolveHeaderLabel(
  column: Column,
  account: Account | undefined,
  t: AppTFunction,
): string {
  return (
    column.label ||
    (account
      ? `${account.label} - ${getPageTypeLabel(column, t)}`
      : getPageTypeLabel(column, t))
  );
}

interface ColumnHeaderProps {
  column: Column;
  account: Account | undefined;
  onReload: (columnId: string) => void;
  onReloadPage: (columnId: string) => void;
  onScrollTop: (columnId: string) => void;
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
  onScrollTop,
  onSettings,
  onClose,
  unreadCount = 0,
  onClearUnread,
}) => {
  const { t } = useTranslation();
  const isExternal = column.pageType === "external";
  const label = resolveHeaderLabel(column, account, t);
  const { remaining, reset } = useAutoReload({
    columnId: column.id,
    enabled: column.settings.autoReloadEnabled && isAutoReloadSupported(column),
    intervalSec: column.settings.autoReloadInterval,
  });

  const showCountdown =
    !isExternal && column.settings.showCountdown && remaining !== null;

  const withCountdownReset = (action: (columnId: string) => void) => () => {
    action(column.id);
    reset();
  };

  return (
    <div
      className={styles.header}
      style={{ borderTopColor: account?.color ?? "#888" }}
    >
      <span
        className={styles.dot}
        style={{ backgroundColor: account?.color ?? "#888" }}
      />
      <span className={styles.label}>{label}</span>
      {!isExternal && unreadCount > 0 && (
        <button
          className={styles.unreadBadge}
          data-testid="unread-badge"
          onClick={() => onClearUnread?.(column.id)}
          title={t("columns:header.clearUnread")}
          aria-label={t("columns:header.unread")}
        />
      )}
      {showCountdown && (
        <span
          className={styles.countdown}
          title={t("columns:header.nextReload")}
        >
          {remaining}s
        </span>
      )}
      <div className={styles.actions}>
        {!isExternal && (
          <button
            className={styles.actionBtn}
            onClick={() => onScrollTop(column.id)}
            aria-label={t("columns:header.scrollTop")}
            title={t("columns:header.scrollTop")}
          >
            <ChevronsUpIcon
              width={14}
              height={14}
              data-testid="icon-chevrons-up"
            />
          </button>
        )}
        {!isExternal && (
          <button
            className={styles.actionBtn}
            onClick={withCountdownReset(onReload)}
            aria-label={t("columns:header.reload")}
            title={t("columns:header.reload")}
          >
            ↺
          </button>
        )}
        <button
          className={styles.actionBtn}
          onClick={withCountdownReset(onReloadPage)}
          aria-label={t("columns:header.reloadPage")}
          title={t("columns:header.reloadPage")}
        >
          ⟳
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => onSettings(column.id)}
          aria-label={t("columns:header.settings")}
          title={t("columns:header.settings")}
        >
          <SettingsIcon width={14} height={14} data-testid="icon-settings" />
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => onClose(column.id)}
          aria-label={t("columns:header.close")}
          title={t("columns:header.close")}
        >
          <CloseIcon width={14} height={14} data-testid="icon-close" />
        </button>
      </div>
    </div>
  );
};

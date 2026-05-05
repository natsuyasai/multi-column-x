import React from "react";
import type { Column, Account, PageType } from "../../types";
import styles from "./MobileTabBar.module.scss";

function getTabLabel(column: Column): string {
  if (column.label) return column.label;
  const labels: Record<PageType, string> = {
    home: column.homeTabName ?? "ホーム",
    notifications: "通知",
    search: column.searchQuery ? `検索: ${column.searchQuery}` : "検索",
    list: "リスト",
    custom: "カスタム",
  };
  return labels[column.pageType];
}

interface Props {
  columns: Column[];
  accounts: Account[];
  activeColumnId: string | null;
  onSelectColumn: (id: string) => void;
  onOpenSettings: (id: string) => void;
}

export const MobileTabBar: React.FC<Props> = ({
  columns,
  accounts,
  activeColumnId,
  onSelectColumn,
  onOpenSettings,
}) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  return (
    <div className={styles.tabBar}>
      {sorted.map((col) => {
        const account = accounts.find((a) => a.id === col.accountId);
        const isActive = col.id === activeColumnId;
        return (
          <div
            key={col.id}
            role="button"
            tabIndex={0}
            aria-current={isActive ? "true" : undefined}
            className={`${styles.tab} ${isActive ? styles.active : ""}`}
            onClick={() => onSelectColumn(col.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectColumn(col.id);
              }
            }}
          >
            <div
              className={styles.accountColor}
              style={{ backgroundColor: account?.color ?? "#888" }}
            />
            <span className={styles.label}>{getTabLabel(col)}</span>
            <button
              className={styles.settingsBtn}
              aria-label="設定"
              title="設定"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings(col.id);
              }}
            >
              ⚙
            </button>
          </div>
        );
      })}
    </div>
  );
};

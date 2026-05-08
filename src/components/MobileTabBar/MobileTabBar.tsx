import React, { useState } from "react";
import type { Column, Account, PageType } from "../../types";
import { useAutoReload } from "../../hooks/useAutoReload";
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

interface TabItemProps {
  column: Column;
  account: Account | undefined;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onOpenSettings: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
}

const TabItem: React.FC<TabItemProps> = ({
  column,
  account,
  isActive,
  isFirst,
  isLast,
  onSelect,
  onOpenSettings,
  onMoveLeft,
  onMoveRight,
  onRemove,
}) => {
  const { remaining } = useAutoReload({
    columnId: column.id,
    enabled: column.settings.autoReloadEnabled,
    intervalSec: column.settings.autoReloadInterval,
  });
  const showCountdown =
    isActive && column.settings.showCountdown && remaining !== null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      className={`${styles.tab} ${isActive ? styles.active : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className={styles.accountColor}
        style={{ backgroundColor: account?.color ?? "#888" }}
      />
      <span className={styles.label}>{getTabLabel(column)}</span>
      {showCountdown && <span className={styles.countdown}>{remaining}s</span>}
      {isActive && (
        <>
          <button
            className={styles.tabBtn}
            aria-label="左に移動"
            title="左に移動"
            disabled={isFirst}
            onClick={(e) => {
              e.stopPropagation();
              onMoveLeft();
            }}
          >
            ←
          </button>
          <button
            className={styles.tabBtn}
            aria-label="右に移動"
            title="右に移動"
            disabled={isLast}
            onClick={(e) => {
              e.stopPropagation();
              onMoveRight();
            }}
          >
            →
          </button>
          <button
            className={styles.tabBtn}
            aria-label="設定"
            title="設定"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
          >
            ⚙
          </button>
          <button
            className={styles.tabBtn}
            aria-label="削除"
            title="削除"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
};

interface Props {
  columns: Column[];
  accounts: Account[];
  activeColumnId: string | null;
  onSelectColumn: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onRemoveColumn: (id: string) => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onAppSettings: () => void;
  onOpenLinkPopup: () => void;
}

export const MobileTabBar: React.FC<Props> = ({
  columns,
  accounts,
  activeColumnId,
  onSelectColumn,
  onOpenSettings,
  onMoveLeft,
  onMoveRight,
  onRemoveColumn,
  onAddColumn,
  onAccountManager,
  onAppSettings,
  onOpenLinkPopup,
}) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {sorted.map((col, idx) => {
          const account = accounts.find((a) => a.id === col.accountId);
          const isActive = col.id === activeColumnId;
          return (
            <TabItem
              key={col.id}
              column={col}
              account={account}
              isActive={isActive}
              isFirst={idx === 0}
              isLast={idx === sorted.length - 1}
              onSelect={() => onSelectColumn(col.id)}
              onOpenSettings={() => onOpenSettings(col.id)}
              onMoveLeft={() => onMoveLeft(col.id)}
              onMoveRight={() => onMoveRight(col.id)}
              onRemove={() => onRemoveColumn(col.id)}
            />
          );
        })}
      </div>

      <button
        className={styles.toggleBtn}
        onClick={() => setExpanded((prev) => !prev)}
        title="メニュー表示の切り替え"
      >
        {expanded ? "«" : "»"}
      </button>
      {expanded && (
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            aria-label="URLをポップアップで開く"
            title="URLをポップアップで開く"
            onClick={onOpenLinkPopup}
          >
            🔗
          </button>
          <button
            className={styles.actionBtn}
            aria-label="アプリ設定"
            title="アプリ設定"
            onClick={onAppSettings}
          >
            ⚙
          </button>
          <button
            className={styles.actionBtn}
            aria-label="アカウント管理"
            title="アカウント管理"
            onClick={onAccountManager}
          >
            👤
          </button>
          <button
            className={styles.actionBtn}
            aria-label="カラムを追加"
            title="カラムを追加"
            onClick={onAddColumn}
          >
            ＋
          </button>
        </div>
      )}
    </div>
  );
};

import React, { useState, useRef } from "react";
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
  swipeActivated: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  showSortButtons: boolean;
}

const TabItem: React.FC<TabItemProps> = ({
  column,
  account,
  isActive,
  isFirst,
  isLast,
  swipeActivated,
  onSelect,
  onLongPress,
  onMoveLeft,
  onMoveRight,
  showSortButtons,
}) => {
  const { remaining } = useAutoReload({
    columnId: column.id,
    enabled: column.settings.autoReloadEnabled,
    intervalSec: column.settings.autoReloadInterval,
  });
  const showCountdown =
    isActive && column.settings.showCountdown && remaining !== null;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClick = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const fireLongPress = () => {
    suppressNextClick.current = true;
    onLongPress();
  };

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  const className = [
    styles.tab,
    isActive ? styles.active : "",
    isActive && swipeActivated ? styles.swipeActivated : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      className={className}
      onClick={() => {
        if (suppressNextClick.current) {
          suppressNextClick.current = false;
          return;
        }
        onSelect();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        fireLongPress();
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStartPos.current = { x: t.clientX, y: t.clientY };
        longPressTimer.current = setTimeout(fireLongPress, 500);
      }}
      onTouchEnd={clearLongPress}
      onTouchMove={(e) => {
        if (!touchStartPos.current) return;
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - touchStartPos.current.x);
        const dy = Math.abs(t.clientY - touchStartPos.current.y);
        if (dx > 8 || dy > 8) clearLongPress();
      }}
      onTouchCancel={clearLongPress}
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
      {isActive && showSortButtons && (
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
        </>
      )}
    </div>
  );
};

interface Props {
  columns: Column[];
  accounts: Account[];
  activeColumnId: string | null;
  swipeState?: { direction: "left" | "right"; phase: "progress" | "switching" } | null;
  onSelectColumn: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onAppSettings: () => void;
  onOpenLinkPopup: () => void;
  onComposeTweet: () => void;
  showSortButtons: boolean;
  onTabAction: (columnId: string) => void;
}

export const MobileTabBar: React.FC<Props> = ({
  columns,
  accounts,
  activeColumnId,
  swipeState,
  onSelectColumn,
  onMoveLeft,
  onMoveRight,
  onAddColumn,
  onAccountManager,
  onAppSettings,
  onOpenLinkPopup,
  onComposeTweet,
  showSortButtons,
  onTabAction,
}) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.tabBar}>
      {swipeState && (
        <div
          className={[
            styles.swipeIndicator,
            swipeState.direction === "left" ? styles.swipeIndicatorLeft : styles.swipeIndicatorRight,
            swipeState.phase === "progress" ? styles.swipeIndicatorProgress : styles.swipeIndicatorSwitching,
          ].join(" ")}
        >
          {swipeState.direction === "left" ? "›" : "‹"}
        </div>
      )}
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
              swipeActivated={isActive && swipeState?.phase === "switching"}
              onSelect={() => onSelectColumn(col.id)}
              onLongPress={() => onTabAction(col.id)}
              onMoveLeft={() => onMoveLeft(col.id)}
              onMoveRight={() => onMoveRight(col.id)}
              showSortButtons={showSortButtons}
            />
          );
        })}
      </div>
      <button
        className={styles.actionBtn}
        aria-label="ツイートを作成"
        title="ツイートを作成"
        onClick={onComposeTweet}
      >
        ✏
      </button>

      <button
        className={styles.toggleBtn}
        onClick={() => setExpanded((prev) => !prev)}
        title="メニュー表示の切り替え"
      >
        {expanded ? "»" : "«"}
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

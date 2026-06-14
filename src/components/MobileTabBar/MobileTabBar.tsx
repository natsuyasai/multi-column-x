import React, { useState, useRef } from "react";
import type { Column, Account, PageType } from "../../types";
import { useAutoReload } from "../../hooks/useAutoReload";
import PencilIcon from "../../assets/icons/pencil.svg?react";
import LinkIcon from "../../assets/icons/link.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";
import PersonIcon from "../../assets/icons/person.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import styles from "./MobileTabBar.module.scss";

const MIN_FLICK_PX = 40;
const MAX_FLICK_MS = 600;

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
  swipeActivated: boolean;
  onSelect: () => void;
  onLongPress: () => void;
}

const TabItem: React.FC<TabItemProps> = ({
  column,
  account,
  isActive,
  swipeActivated,
  onSelect,
  onLongPress,
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
  ]
    .filter(Boolean)
    .join(" ");

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
    </div>
  );
};

interface Props {
  columns: Column[];
  accounts: Account[];
  activeColumnId: string | null;
  swipeState?: {
    direction: "left" | "right";
    phase: "progress" | "switching";
  } | null;
  onSelectColumn: (id: string) => void;
  onSwipeNavigate?: (direction: "left" | "right") => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onAppSettings: () => void;
  onOpenLinkPopup: () => void;
  onComposeTweet: () => void;
  onTabAction: (columnId: string) => void;
}

export const MobileTabBar: React.FC<Props> = ({
  columns,
  accounts,
  activeColumnId,
  swipeState,
  onSelectColumn,
  onSwipeNavigate,
  onAddColumn,
  onAccountManager,
  onAppSettings,
  onOpenLinkPopup,
  onComposeTweet,
  onTabAction,
}) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const [expanded, setExpanded] = useState(false);
  const flickStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const handleFlickStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    flickStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleFlickEnd = (e: React.TouchEvent) => {
    const start = flickStart.current;
    flickStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    if (Date.now() - start.time > MAX_FLICK_MS) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < MIN_FLICK_PX || Math.abs(dx) <= Math.abs(dy)) return;
    onSwipeNavigate?.(dx < 0 ? "left" : "right");
  };

  const cancelFlick = () => {
    flickStart.current = null;
  };

  return (
    <div
      className={styles.tabBar}
      onTouchStart={handleFlickStart}
      onTouchEnd={handleFlickEnd}
      onTouchCancel={cancelFlick}
    >
      {swipeState && (
        <div
          className={[
            styles.swipeIndicator,
            swipeState.direction === "left"
              ? styles.swipeIndicatorLeft
              : styles.swipeIndicatorRight,
            swipeState.phase === "progress"
              ? styles.swipeIndicatorProgress
              : styles.swipeIndicatorSwitching,
          ].join(" ")}
        >
          {swipeState.direction === "left" ? "›" : "‹"}
        </div>
      )}
      <div className={styles.tabs}>
        {sorted.map((col) => {
          const account = accounts.find((a) => a.id === col.accountId);
          const isActive = col.id === activeColumnId;
          return (
            <TabItem
              key={col.id}
              column={col}
              account={account}
              isActive={isActive}
              swipeActivated={isActive && swipeState?.phase === "switching"}
              onSelect={() => onSelectColumn(col.id)}
              onLongPress={() => onTabAction(col.id)}
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
        <PencilIcon width={18} height={18} data-testid="icon-pencil" />
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
            <LinkIcon width={18} height={18} data-testid="icon-link" />
          </button>
          <button
            className={styles.actionBtn}
            aria-label="アプリ設定"
            title="アプリ設定"
            onClick={onAppSettings}
          >
            <SettingsIcon width={18} height={18} data-testid="icon-settings" />
          </button>
          <button
            className={styles.actionBtn}
            aria-label="アカウント管理"
            title="アカウント管理"
            onClick={onAccountManager}
          >
            <PersonIcon width={18} height={18} data-testid="icon-person" />
          </button>
          <button
            className={styles.actionBtn}
            aria-label="カラムを追加"
            title="カラムを追加"
            onClick={onAddColumn}
          >
            <PlusIcon width={18} height={18} data-testid="icon-plus" />
          </button>
        </div>
      )}
    </div>
  );
};

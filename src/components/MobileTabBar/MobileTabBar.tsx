import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AppTFunction } from "@/i18n/types";
import { isAutoReloadSupported } from "@/lib/autoReloadTarget";
import ChevronLeftIcon from "../../assets/icons/chevron-left.svg?react";
import ChevronRightIcon from "../../assets/icons/chevron-right.svg?react";
import LinkIcon from "../../assets/icons/link.svg?react";
import PencilIcon from "../../assets/icons/pencil.svg?react";
import PersonIcon from "../../assets/icons/person.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import { useAutoReload } from "../../hooks/useAutoReload";
import { getPageTypeLabel } from "../../types";
import type { Column, Account, ApiRateLimitBucket } from "../../types";
import { ApiRateLimitIndicator } from "../ApiRateLimitIndicator/ApiRateLimitIndicator";
import styles from "./MobileTabBar.module.scss";

function getTabLabel(column: Column, t: AppTFunction): string {
  if (column.label) return column.label;
  return getPageTypeLabel(column, t);
}

interface TabItemProps {
  column: Column;
  account: Account | undefined;
  isActive: boolean;
  swipeActivated: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  onDoubleTap: () => void;
}

// ネイティブ側の旧実装（DoubleTapGestureDetector.kt）と同じ 300ms 閾値
const DOUBLE_TAP_MAX_MS = 300;

const TabItem: React.FC<TabItemProps> = ({
  column,
  account,
  isActive,
  swipeActivated,
  onSelect,
  onLongPress,
  onDoubleTap,
}) => {
  const { t } = useTranslation();
  const isExternal = column.pageType === "external";
  const { remaining } = useAutoReload({
    columnId: column.id,
    enabled: column.settings.autoReloadEnabled && isAutoReloadSupported(column),
    intervalSec: column.settings.autoReloadInterval,
  });
  const showCountdown =
    !isExternal &&
    isActive &&
    column.settings.showCountdown &&
    remaining !== null;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClick = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef(0);

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
        const now = Date.now();
        const isDoubleTap = now - lastTapTimeRef.current < DOUBLE_TAP_MAX_MS;
        // 3 回目の素早いクリックが誤ってダブルタップ扱いにならないようリセットする
        lastTapTimeRef.current = isDoubleTap ? 0 : now;
        if (isDoubleTap) {
          onDoubleTap();
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
      <span className={styles.label}>{getTabLabel(column, t)}</span>
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
  onAddColumn: () => void;
  onAccountManager: () => void;
  onAppSettings: () => void;
  onOpenLinkPopup: () => void;
  onComposeTweet: () => void;
  onTabAction: (columnId: string) => void;
  onDoubleTapColumn: (columnId: string) => void;
  apiRateLimitMonitorEnabled: boolean;
  apiRateLimits: Record<string, Record<string, ApiRateLimitBucket>>;
  onApiRateLimitPopoverOpenChange: (isOpen: boolean) => void;
}

export const MobileTabBar: React.FC<Props> = ({
  columns,
  accounts,
  activeColumnId,
  swipeState,
  onSelectColumn,
  onAddColumn,
  onAccountManager,
  onAppSettings,
  onOpenLinkPopup,
  onComposeTweet,
  onTabAction,
  onDoubleTapColumn,
  apiRateLimitMonitorEnabled,
  apiRateLimits,
  onApiRateLimitPopoverOpenChange,
}) => {
  const { t } = useTranslation();
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.tabBar}>
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
              onDoubleTap={() => onDoubleTapColumn(col.id)}
            />
          );
        })}
      </div>
      <div className={styles.menu}>
        <button
          className={styles.actionBtn}
          aria-label={t("mobile:composeTweet")}
          title={t("mobile:composeTweet")}
          onClick={onComposeTweet}
        >
          <PencilIcon width={18} height={18} data-testid="icon-pencil" />
        </button>

        <button
          className={styles.toggleBtn}
          onClick={() => setExpanded((prev) => !prev)}
          title={t("mobile:toggleMenu")}
        >
          {expanded ? (
            <ChevronRightIcon
              width={18}
              height={18}
              data-testid="icon-chevron-right"
            />
          ) : (
            <ChevronLeftIcon
              width={18}
              height={18}
              data-testid="icon-chevron-left"
            />
          )}
        </button>
        {expanded && (
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              aria-label={t("mobile:openLinkPopup")}
              title={t("mobile:openLinkPopup")}
              onClick={onOpenLinkPopup}
            >
              <LinkIcon width={18} height={18} data-testid="icon-link" />
            </button>
            <button
              className={styles.actionBtn}
              aria-label={t("mobile:appSettings")}
              title={t("mobile:appSettings")}
              onClick={onAppSettings}
            >
              <SettingsIcon
                width={18}
                height={18}
                data-testid="icon-settings"
              />
            </button>
            <button
              className={styles.actionBtn}
              aria-label={t("mobile:accountManager")}
              title={t("mobile:accountManager")}
              onClick={onAccountManager}
            >
              <PersonIcon width={18} height={18} data-testid="icon-person" />
            </button>
            <button
              className={styles.actionBtn}
              aria-label={t("mobile:addColumn")}
              title={t("mobile:addColumn")}
              onClick={onAddColumn}
            >
              <PlusIcon width={18} height={18} data-testid="icon-plus" />
            </button>
            {apiRateLimitMonitorEnabled && (
              <ApiRateLimitIndicator
                accounts={accounts}
                apiRateLimits={apiRateLimits}
                onOpenChange={onApiRateLimitPopoverOpenChange}
                isMobile
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React from "react";
import type { Account, Column, PageType } from "../../types";
import HomeIcon from "../../assets/icons/home.svg?react";
import NotificationsIcon from "../../assets/icons/notifications.svg?react";
import SearchIcon from "../../assets/icons/search.svg?react";
import ListIcon from "../../assets/icons/list.svg?react";
import CustomIcon from "../../assets/icons/custom.svg?react";
import PencilIcon from "../../assets/icons/pencil.svg?react";
import LinkIcon from "../../assets/icons/link.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";
import PersonIcon from "../../assets/icons/person.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import styles from "./TopBar.module.scss";

interface TopBarProps {
  columns: Column[];
  accounts: Account[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onAppSettings: () => void;
  onComposeTweet: () => void;
  onOpenLinkPopup: () => void;
  onJumpToColumn: (columnId: string) => void;
}

function getColumnIcon(pageType: PageType): React.ReactElement {
  const props = {
    width: 16,
    height: 16,
    "data-testid": `icon-${pageType}`,
  } as const;
  switch (pageType) {
    case "home":
      return <HomeIcon {...props} />;
    case "notifications":
      return <NotificationsIcon {...props} />;
    case "search":
      return <SearchIcon {...props} />;
    case "list":
      return <ListIcon {...props} />;
    case "custom":
      return <CustomIcon {...props} />;
  }
}

function getPageLabel(column: Column): string {
  switch (column.pageType) {
    case "home":
      return column.homeTabName ?? "ホーム";
    case "notifications":
      return "通知";
    case "search":
      return `検索: ${column.searchQuery ?? ""}`;
    case "list":
      return "リスト";
    case "custom":
      return "カスタム";
  }
}

function columnDisplayName(column: Column, accounts: Account[]): string {
  if (column.label) return column.label;
  const account = accounts.find((a) => a.id === column.accountId);
  if (account) return `${account.label} - ${getPageLabel(column)}`;
  return getPageLabel(column);
}

export const TopBar: React.FC<TopBarProps> = ({
  columns,
  accounts,
  expanded,
  onToggleExpand,
  onAddColumn,
  onAccountManager,
  onAppSettings,
  onComposeTweet,
  onOpenLinkPopup,
  onJumpToColumn,
}) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  return (
    <div className={`${styles.topbar}${expanded ? ` ${styles.expanded}` : ""}`}>
      <div className={styles.row1}>
        <div className={styles.actions}>
          <button
            className={`${styles.composeBtn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onComposeTweet}
            title="ツイートを作成 (Ctrl+T)"
          >
            <PencilIcon
              width={16}
              height={16}
              data-testid="icon-pencil"
              className={styles.icon}
            />
            {expanded && <span className={styles.label}>ツイート</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onOpenLinkPopup}
            title="URLをポップアップで開く (Ctrl+L)"
          >
            <LinkIcon
              width={16}
              height={16}
              data-testid="icon-link"
              className={styles.icon}
            />
            {expanded && <span className={styles.label}>URLを開く</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onAddColumn}
            title="カラムを追加 (Ctrl+N)"
          >
            <PlusIcon
              width={16}
              height={16}
              data-testid="icon-plus"
              className={styles.icon}
            />
            {expanded && <span className={styles.label}>カラム追加</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onAccountManager}
            title="アカウント管理 (Ctrl+Shift+A)"
          >
            <PersonIcon
              width={16}
              height={16}
              data-testid="icon-person"
              className={styles.icon}
            />
            {expanded && <span className={styles.label}>アカウント</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onAppSettings}
            title="アプリ設定 (Ctrl+,)"
          >
            <SettingsIcon
              width={16}
              height={16}
              data-testid="icon-settings"
              className={styles.icon}
            />
            {expanded && <span className={styles.label}>設定</span>}
          </button>
        </div>

        {!expanded && (
          <>
            <div className={styles.divider} />
            <div className={styles.columnList}>
              {sorted.map((col, index) => (
                <button
                  key={col.id}
                  className={styles.btn}
                  onClick={() => onJumpToColumn(col.id)}
                  title={
                    index < 9
                      ? `${columnDisplayName(col, accounts)} (Ctrl+${index + 1})`
                      : columnDisplayName(col, accounts)
                  }
                >
                  {getColumnIcon(col.pageType)}
                </button>
              ))}
            </div>
          </>
        )}

        <div className={styles.spacer} />

        <button
          className={styles.toggleBtn}
          onClick={onToggleExpand}
          title={
            expanded
              ? "ツールバーを折りたたむ (Ctrl+B)"
              : "ツールバーを展開 (Ctrl+B)"
          }
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div className={styles.row2} data-testid="topbar-row2">
          {sorted.map((col, index) => (
            <button
              key={col.id}
              className={`${styles.btn} ${styles.btnExpanded}`}
              onClick={() => onJumpToColumn(col.id)}
              title={
                index < 9
                  ? `${columnDisplayName(col, accounts)} (Ctrl+${index + 1})`
                  : columnDisplayName(col, accounts)
              }
            >
              <span className={styles.icon}>{getColumnIcon(col.pageType)}</span>
              <span className={styles.label}>
                {columnDisplayName(col, accounts)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

import React from "react";
import type { Account, Column, PageType } from "../../types";
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

function getColumnIcon(pageType: PageType): string {
  switch (pageType) {
    case "home":
      return "🏠";
    case "notifications":
      return "🔔";
    case "search":
      return "🔍";
    case "list":
      return "📄";
    case "custom":
      return "🌐";
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
    <div
      className={`${styles.topbar}${expanded ? ` ${styles.expanded}` : ""}`}
    >
      <div className={styles.row1}>
        <div className={styles.actions}>
          <button
            className={`${styles.composeBtn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onComposeTweet}
            title="ツイートを作成"
          >
            <span className={styles.icon}>✏️</span>
            {expanded && <span className={styles.label}>ツイート</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onOpenLinkPopup}
            title="URLをポップアップで開く"
          >
            <span className={styles.icon}>🔗</span>
            {expanded && <span className={styles.label}>URLを開く</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onAddColumn}
            title="カラムを追加"
          >
            <span className={styles.icon}>＋</span>
            {expanded && <span className={styles.label}>カラム追加</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onAccountManager}
            title="アカウント管理"
          >
            <span className={styles.icon}>👤</span>
            {expanded && <span className={styles.label}>アカウント</span>}
          </button>
          <button
            className={`${styles.btn}${expanded ? ` ${styles.btnExpanded}` : ""}`}
            onClick={onAppSettings}
            title="アプリ設定"
          >
            <span className={styles.icon}>⚙</span>
            {expanded && <span className={styles.label}>設定</span>}
          </button>
        </div>

        {!expanded && (
          <>
            <div className={styles.divider} />
            <div className={styles.columnList}>
              {sorted.map((col) => (
                <button
                  key={col.id}
                  className={styles.btn}
                  onClick={() => onJumpToColumn(col.id)}
                  title={columnDisplayName(col, accounts)}
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
          title={expanded ? "ツールバーを折りたたむ" : "ツールバーを展開"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div className={styles.row2} data-testid="topbar-row2">
          {sorted.map((col) => (
            <button
              key={col.id}
              className={`${styles.btn} ${styles.btnExpanded}`}
              onClick={() => onJumpToColumn(col.id)}
              title={columnDisplayName(col, accounts)}
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

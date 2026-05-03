import React from "react";
import type { Column } from "../../types";
import styles from "./Sidebar.module.scss";

interface SidebarProps {
  columns: Column[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onComposeTweet: () => void;
  onJumpToColumn: (columnId: string) => void;
}

function columnDisplayName(column: Column): string {
  if (column.label) return column.label;
  switch (column.pageType) {
    case "home": return "ホーム";
    case "notifications": return "通知";
    case "search": return column.searchQuery ?? "検索";
    case "list": return "リスト";
    case "custom": return "カスタム";
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  columns,
  expanded,
  onToggleExpand,
  onAddColumn,
  onAccountManager,
  onComposeTweet,
  onJumpToColumn,
}) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  return (
    <div className={`${styles.sidebar}${expanded ? ` ${styles.expanded}` : ""}`}>
      {expanded ? (
        <button
          className={`${styles.composeTweetBtn} ${styles.composeTweetBtnExpanded}`}
          onClick={onComposeTweet}
          title="ツイートを作成"
        >
          <span className={styles.icon}>✏️</span>
          <span className={styles.label}>ツイート</span>
        </button>
      ) : (
        <button
          className={styles.composeTweetBtn}
          onClick={onComposeTweet}
          title="ツイートを作成"
        >
          ✏️
        </button>
      )}

      <div className={styles.divider} />

      <div className={styles.columnList}>
        {sorted.map((col) => (
          expanded ? (
            <button
              key={col.id}
              className={`${styles.btn} ${styles.btnExpanded}`}
              onClick={() => onJumpToColumn(col.id)}
              title={columnDisplayName(col)}
            >
              <span className={styles.icon}>📋</span>
              <span className={styles.label}>{columnDisplayName(col)}</span>
            </button>
          ) : (
            <button
              key={col.id}
              className={styles.btn}
              onClick={() => onJumpToColumn(col.id)}
              title={columnDisplayName(col)}
            >
              📋
            </button>
          )
        ))}
      </div>

      {expanded ? (
        <button
          className={`${styles.btn} ${styles.btnExpanded}`}
          onClick={onAddColumn}
          title="カラムを追加"
        >
          <span className={styles.icon}>＋</span>
          <span className={styles.label}>カラム追加</span>
        </button>
      ) : (
        <button
          className={styles.btn}
          onClick={onAddColumn}
          title="カラムを追加"
        >
          ＋
        </button>
      )}

      {expanded ? (
        <button
          className={`${styles.btn} ${styles.btnExpanded}`}
          onClick={onAccountManager}
          title="アカウント管理"
        >
          <span className={styles.icon}>👤</span>
          <span className={styles.label}>アカウント</span>
        </button>
      ) : (
        <button
          className={styles.btn}
          onClick={onAccountManager}
          title="アカウント管理"
        >
          👤
        </button>
      )}

      {expanded ? (
        <button
          className={`${styles.toggleBtn} ${styles.toggleBtnExpanded}`}
          onClick={onToggleExpand}
          title="サイドバーを閉じる"
        >
          <span className={styles.icon}>«</span>
          <span className={styles.label}>閉じる</span>
        </button>
      ) : (
        <button
          className={styles.toggleBtn}
          onClick={onToggleExpand}
          title="サイドバーを開く"
        >
          »
        </button>
      )}
    </div>
  );
};

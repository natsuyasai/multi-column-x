import React from "react";
import LinkIcon from "../../assets/icons/link.svg?react";
import PencilIcon from "../../assets/icons/pencil.svg?react";
import PersonIcon from "../../assets/icons/person.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";
import SettingsIcon from "../../assets/icons/settings.svg?react";
import type { Account, ApiRateLimitBucket, Column } from "../../types";
import { ApiRateLimitIndicator } from "../ApiRateLimitIndicator/ApiRateLimitIndicator";
import { SortableColumnGroups } from "./SortableColumnGroups";
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
  onClose: (columnId: string) => void;
  onReorderColumnGroup: (fromIdx: number, toIdx: number) => void;
  apiRateLimitMonitorEnabled: boolean;
  apiRateLimits: Record<string, Record<string, ApiRateLimitBucket>>;
  onApiRateLimitPopoverOpenChange: (isOpen: boolean) => void;
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
  onClose,
  onReorderColumnGroup,
  apiRateLimitMonitorEnabled,
  apiRateLimits,
  onApiRateLimitPopoverOpenChange,
}) => {
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
          {apiRateLimitMonitorEnabled && (
            <ApiRateLimitIndicator
              accounts={accounts}
              apiRateLimits={apiRateLimits}
              onOpenChange={onApiRateLimitPopoverOpenChange}
            />
          )}
        </div>

        {!expanded && (
          <>
            <div className={styles.divider} />
            <div className={styles.columnList}>
              <SortableColumnGroups
                variant="collapsed"
                columns={columns}
                accounts={accounts}
                onJumpToColumn={onJumpToColumn}
                onClose={onClose}
                onReorderColumnGroup={onReorderColumnGroup}
              />
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
          <SortableColumnGroups
            variant="expanded"
            columns={columns}
            accounts={accounts}
            onJumpToColumn={onJumpToColumn}
            onClose={onClose}
            onReorderColumnGroup={onReorderColumnGroup}
          />
        </div>
      )}
    </div>
  );
};

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

interface ToolbarButtonProps {
  baseClassName: string;
  expanded: boolean;
  onClick: () => void;
  title: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconTestId: string;
  label: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  baseClassName,
  expanded,
  onClick,
  title,
  Icon,
  iconTestId,
  label,
}) => (
  <button
    className={`${baseClassName}${expanded ? ` ${styles.btnExpanded}` : ""}`}
    onClick={onClick}
    title={title}
  >
    <Icon
      width={16}
      height={16}
      data-testid={iconTestId}
      className={styles.icon}
    />
    {expanded && <span className={styles.label}>{label}</span>}
  </button>
);

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
          <ToolbarButton
            baseClassName={styles.composeBtn}
            expanded={expanded}
            onClick={onComposeTweet}
            title="ツイートを作成 (Ctrl+T)"
            Icon={PencilIcon}
            iconTestId="icon-pencil"
            label="ツイート"
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onOpenLinkPopup}
            title="URLをポップアップで開く (Ctrl+L)"
            Icon={LinkIcon}
            iconTestId="icon-link"
            label="URLを開く"
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onAddColumn}
            title="カラムを追加 (Ctrl+N)"
            Icon={PlusIcon}
            iconTestId="icon-plus"
            label="カラム追加"
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onAccountManager}
            title="アカウント管理 (Ctrl+Shift+A)"
            Icon={PersonIcon}
            iconTestId="icon-person"
            label="アカウント"
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onAppSettings}
            title="アプリ設定 (Ctrl+,)"
            Icon={SettingsIcon}
            iconTestId="icon-settings"
            label="設定"
          />
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

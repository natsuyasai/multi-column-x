import React from "react";
import { useTranslation } from "react-i18next";
import LinkIcon from "../../assets/icons/link.svg?react";
import PencilIcon from "../../assets/icons/pencil.svg?react";
import PersonIcon from "../../assets/icons/person.svg?react";
import PlusIcon from "../../assets/icons/plus.svg?react";
import RefreshIcon from "../../assets/icons/refresh.svg?react";
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
    type="button"
    className={`${baseClassName}${expanded ? ` ${styles.btnExpanded}` : ""}`}
    onClick={onClick}
    // 展開時は見えているラベルが名前になる。折りたたみ時はアイコンだけなので title を名前にする
    aria-label={expanded ? undefined : title}
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
  onReloadAll: () => void;
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
  onReloadAll,
  onComposeTweet,
  onOpenLinkPopup,
  onJumpToColumn,
  onClose,
  onReorderColumnGroup,
  apiRateLimitMonitorEnabled,
  apiRateLimits,
  onApiRateLimitPopoverOpenChange,
}) => {
  const { t } = useTranslation();
  return (
    <nav
      className={`${styles.topbar}${expanded ? ` ${styles.expanded}` : ""}`}
      aria-label={t("topbar:label")}
    >
      <div className={styles.row1}>
        <div className={styles.actions}>
          <ToolbarButton
            baseClassName={styles.composeBtn}
            expanded={expanded}
            onClick={onComposeTweet}
            title={t("topbar:compose.title")}
            Icon={PencilIcon}
            iconTestId="icon-pencil"
            label={t("topbar:compose.label")}
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onOpenLinkPopup}
            title={t("topbar:linkPopup.title")}
            Icon={LinkIcon}
            iconTestId="icon-link"
            label={t("topbar:linkPopup.label")}
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onAddColumn}
            title={t("topbar:addColumn.title")}
            Icon={PlusIcon}
            iconTestId="icon-plus"
            label={t("topbar:addColumn.label")}
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onAccountManager}
            title={t("topbar:accounts.title")}
            Icon={PersonIcon}
            iconTestId="icon-person"
            label={t("topbar:accounts.label")}
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onAppSettings}
            title={t("topbar:settings.title")}
            Icon={SettingsIcon}
            iconTestId="icon-settings"
            label={t("topbar:settings.label")}
          />
          <ToolbarButton
            baseClassName={styles.btn}
            expanded={expanded}
            onClick={onReloadAll}
            title={t("topbar:reloadAll.title")}
            Icon={RefreshIcon}
            iconTestId="icon-refresh"
            label={t("topbar:reloadAll.label")}
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
            <div
              className={styles.columnList}
              role="group"
              aria-label={t("topbar:columnListLabel")}
            >
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
          type="button"
          className={styles.toggleBtn}
          onClick={onToggleExpand}
          aria-label={expanded ? t("topbar:collapse") : t("topbar:expand")}
          aria-expanded={expanded}
          title={expanded ? t("topbar:collapse") : t("topbar:expand")}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div
          className={styles.row2}
          data-testid="topbar-row2"
          role="group"
          aria-label={t("topbar:columnListLabel")}
        >
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
    </nav>
  );
};

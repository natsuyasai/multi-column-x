import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type { Account, Column, GlobalSettings, PageType } from "../../types";
import {
  COLUMN_LABEL_MAX_LENGTH,
  DEFAULT_COLUMN_SETTINGS,
  normalizeColumnLabel,
} from "../../types";
import styles from "./AddColumnDialog.module.scss";

interface AddColumnDialogProps {
  accounts: Account[];
  globalSettings: GlobalSettings;
  existingColumns: Column[];
  onAdd: (column: Column) => void;
  onCancel: () => void;
}

export const AddColumnDialog: React.FC<AddColumnDialogProps> = ({
  accounts,
  globalSettings,
  existingColumns,
  onAdd,
  onCancel,
}) => {
  const { t } = useTranslation();
  useEscapeKey(onCancel);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pageType, setPageType] = useState<PageType>("home");
  const [homeTabName, setHomeTabName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [listId, setListId] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [label, setLabel] = useState("");

  const isExternal = pageType === "external";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = crypto.randomUUID();
    const occupiedCols = existingColumns
      .map((c) => c.gridCol)
      .filter((g) => g >= 1);
    const nextGridCol =
      occupiedCols.length > 0 ? Math.max(...occupiedCols) + 1 : 1;
    const column: Column = {
      id: newId,
      accountId: isExternal ? newId : accountId,
      pageType,
      homeTabName: pageType === "home" && homeTabName ? homeTabName : undefined,
      searchQuery: pageType === "search" ? searchQuery : undefined,
      searchLiveTab: pageType === "search" ? true : undefined,
      listId: pageType === "list" ? listId : undefined,
      customUrl: pageType === "custom" || isExternal ? customUrl : undefined,
      label: normalizeColumnLabel(label),
      width: 350,
      order: 9999,
      gridRow: 1,
      gridCol: nextGridCol,
      heightMode: "auto",
      settings: isExternal
        ? {
            ...DEFAULT_COLUMN_SETTINGS,
            customCSS: globalSettings.defaultColumnCustomCSS,
          }
        : {
            ...DEFAULT_COLUMN_SETTINGS,
            autoReloadEnabled: globalSettings.defaultAutoReloadEnabled,
            autoReloadInterval: globalSettings.defaultAutoReloadInterval,
            showCountdown: globalSettings.defaultShowCountdown,
            hideHeaderEnabled: globalSettings.defaultHideHeaderEnabled,
            hideTweetInputEnabled: globalSettings.defaultHideTweetInputEnabled,
            showCustomMenu: globalSettings.defaultShowCustomMenu,
            scrollPosRestoreEnabled:
              globalSettings.defaultScrollPosRestoreEnabled,
            customCSS: globalSettings.defaultColumnCustomCSS,
            smallImageEnabled: globalSettings.smallImageEnabled,
            smallImageWidth: globalSettings.smallImageWidth,
            blurImageEnabled: globalSettings.blurImageEnabled,
            blurImageAmount: globalSettings.blurImageAmount,
          },
    };
    onAdd(column);
  };

  return (
    <div className={styles.overlay}>
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 className={styles.title}>{t("columns:addDialog.title")}</h2>

        {!isExternal && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="account-select">
              {t("columns:addDialog.account")}
            </label>
            <select
              id="account-select"
              className={styles.select}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="page-type-select">
            {t("columns:addDialog.pageType")}
          </label>
          <select
            id="page-type-select"
            className={styles.select}
            value={pageType}
            onChange={(e) => setPageType(e.target.value as PageType)}
          >
            <option value="home">{t("columns:pageType.home")}</option>
            <option value="notifications">
              {t("columns:pageType.notifications")}
            </option>
            <option value="search">{t("columns:pageType.search")}</option>
            <option value="list">{t("columns:pageType.list")}</option>
            <option value="custom">
              {t("columns:addDialog.pageTypeOption.custom")}
            </option>
            <option value="external">
              {t("columns:addDialog.pageTypeOption.external")}
            </option>
            <option value="compose">{t("columns:pageType.compose")}</option>
          </select>
        </div>

        {pageType === "home" && (
          <div className={styles.field}>
            <label
              className={styles.label}
              htmlFor="tab-name"
              aria-label={t("columns:addDialog.homeTabName")}
            >
              {t("columns:addDialog.homeTabName")}
            </label>
            <input
              id="tab-name"
              aria-label={t("columns:addDialog.homeTabName")}
              className={styles.input}
              value={homeTabName}
              onChange={(e) => setHomeTabName(e.target.value)}
              placeholder={t("columns:addDialog.homeTabNamePlaceholder")}
            />
          </div>
        )}

        {pageType === "search" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="search-query">
              {t("columns:addDialog.searchQuery")}
            </label>
            <input
              id="search-query"
              className={styles.input}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("columns:addDialog.searchQueryPlaceholder")}
              required
            />
          </div>
        )}

        {pageType === "list" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="list-id">
              {t("columns:addDialog.listId")}
            </label>
            <input
              id="list-id"
              className={styles.input}
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              placeholder={t("columns:addDialog.listIdPlaceholder")}
              required
            />
          </div>
        )}

        {(pageType === "custom" || isExternal) && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="custom-url">
              {t("columns:addDialog.url")}
            </label>
            <input
              id="custom-url"
              className={styles.input}
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder={t("columns:addDialog.urlPlaceholder")}
              required
            />
            {isExternal && (
              <p className={styles.hint}>
                {t("columns:addDialog.externalHint")}
              </p>
            )}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="column-label">
            {t("columns:addDialog.label")}
          </label>
          <input
            id="column-label"
            aria-label={t("columns:addDialog.label")}
            className={styles.input}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("columns:addDialog.labelPlaceholder")}
            maxLength={COLUMN_LABEL_MAX_LENGTH}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {t("columns:addDialog.cancel")}
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={pageType !== "external" && accounts.length === 0}
          >
            {t("columns:addDialog.submit")}
          </button>
        </div>
      </form>
    </div>
  );
};

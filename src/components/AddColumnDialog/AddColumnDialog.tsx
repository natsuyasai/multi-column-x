import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Account, Column, GlobalSettings, PageType } from "../../types";
import { DEFAULT_COLUMN_SETTINGS } from "../../types";
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
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pageType, setPageType] = useState<PageType>("home");
  const [homeTabName, setHomeTabName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [listId, setListId] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const occupiedCols = existingColumns.map((c) => c.gridCol).filter((g) => g >= 1);
    const nextGridCol = occupiedCols.length > 0 ? Math.max(...occupiedCols) + 1 : 1;
    const column: Column = {
      id: uuidv4(),
      accountId,
      pageType,
      homeTabName: pageType === "home" && homeTabName ? homeTabName : undefined,
      searchQuery: pageType === "search" ? searchQuery : undefined,
      listId: pageType === "list" ? listId : undefined,
      customUrl: pageType === "custom" ? customUrl : undefined,
      width: 350,
      order: 9999,
      gridRow: 1,
      gridCol: nextGridCol,
      heightMode: "auto",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        autoReloadEnabled: globalSettings.defaultAutoReloadEnabled,
        autoReloadInterval: globalSettings.defaultAutoReloadInterval,
      },
    };
    onAdd(column);
  };

  return (
    <div className={styles.overlay}>
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 className={styles.title}>カラムを追加</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="account-select">
            アカウント
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

        <div className={styles.field}>
          <label className={styles.label} htmlFor="page-type-select">
            ページタイプ
          </label>
          <select
            id="page-type-select"
            className={styles.select}
            value={pageType}
            onChange={(e) => setPageType(e.target.value as PageType)}
          >
            <option value="home">ホーム</option>
            <option value="notifications">通知</option>
            <option value="search">検索</option>
            <option value="list">リスト</option>
            <option value="custom">カスタムURL</option>
          </select>
        </div>

        {pageType === "home" && (
          <div className={styles.field}>
            <label
              className={styles.label}
              htmlFor="tab-name"
              aria-label="タブ名（任意）"
            >
              タブ名（任意）
            </label>
            <input
              id="tab-name"
              aria-label="タブ名（任意）"
              className={styles.input}
              value={homeTabName}
              onChange={(e) => setHomeTabName(e.target.value)}
              placeholder="例: フォロー中"
            />
          </div>
        )}

        {pageType === "search" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="search-query">
              検索クエリ
            </label>
            <input
              id="search-query"
              className={styles.input}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="例: tauri"
              required
            />
          </div>
        )}

        {pageType === "list" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="list-id">
              リストID
            </label>
            <input
              id="list-id"
              className={styles.input}
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              placeholder="例: 1234567890"
              required
            />
          </div>
        )}

        {pageType === "custom" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="custom-url">
              URL
            </label>
            <input
              id="custom-url"
              className={styles.input}
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://x.com/..."
              required
            />
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={accounts.length === 0}
          >
            追加
          </button>
        </div>
      </form>
    </div>
  );
};

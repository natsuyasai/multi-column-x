// src/App.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAppStore } from "./store/useAppStore";
import {
  useColumns,
  HEADER_HEIGHT,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from "./hooks/useColumns";
import { useAccounts } from "./hooks/useAccounts";
import { ColumnHeader } from "./components/ColumnHeader/ColumnHeader";
import { AddColumnDialog } from "./components/AddColumnDialog/AddColumnDialog";
import { AccountManager } from "./components/AccountManager/AccountManager";
import { SettingsPanel } from "./components/SettingsPanel/SettingsPanel";
import { AppSettingsPanel } from "./components/AppSettingsPanel/AppSettingsPanel";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ColumnSettings } from "./types";
import styles from "./App.module.scss";

const App: React.FC = () => {
  const {
    loadSettings,
    isLoaded,
    accounts,
    globalSettings,
    updateGlobalSettings,
    sidebarExpanded,
    setSidebarExpanded,
    replaceColumns,
  } = useAppStore();
  const {
    columns,
    columnBounds,
    containerRef,
    scrollbarRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleMoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
    hideColumnWebviews,
    handleScrollbarScroll,
  } = useColumns();
  const { startAddAccount, removeAccount } = useAccounts();

  const sidebarWidth = sidebarExpanded
    ? SIDEBAR_EXPANDED_WIDTH
    : SIDEBAR_COLLAPSED_WIDTH;

  const scrollbarWidth = useMemo(() => {
    const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
    return Object.values(columnBounds).reduce((max, b) => Math.max(max, b.x + b.width + scrollLeft), 0) - sidebarWidth;
  }, [columnBounds, sidebarWidth, scrollbarRef]);

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [settingsColumnId, setSettingsColumnId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  // isLoaded が true になった（= DOM レンダリング完了後）タイミングで WebView を復元
  useEffect(() => {
    if (isLoaded) {
      restoreColumns(sidebarWidth);
    }
  }, [isLoaded]);

  // WebView 内の横ホイールを受け取ってスクロールバーを動かす
  useEffect(() => {
    const unlisten = listen<number>("webview-scroll", (e) => {
      const el = scrollbarRef.current;
      if (el) el.scrollLeft += e.payload;
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [scrollbarRef]);

  // ダイアログ表示中は列WebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  const dialogOpen = showAddColumn || showAccountManager || showAppSettings || !!settingsColumnId;
  useEffect(() => {
    if (dialogOpen) {
      hideColumnWebviews();
    } else {
      recalculateAllBounds();
    }
  }, [dialogOpen]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarExpanded(!sidebarExpanded);
    setTimeout(() => recalculateAllBounds(), 220);
  }, [sidebarExpanded, setSidebarExpanded, recalculateAllBounds]);

  const handleJumpToColumn = useCallback(
    (columnId: string) => {
      const el = scrollbarRef.current;
      if (!el) return;
      const bounds = columnBounds[columnId];
      if (!bounds) return;
      const currentScroll = el.scrollLeft ?? 0;
      el.scrollLeft = currentScroll + bounds.x - (sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH);
    },
    [columnBounds, scrollbarRef, sidebarExpanded],
  );

  const handleReload = useCallback(async (columnId: string) => {
    const webviewLabel = `column-${columnId}`;
    await invoke("eval_in_webview", {
      label: webviewLabel,
      script:
        "window.__twitterViewer && window.__twitterViewer.triggerReload();",
    }).catch(console.error);
  }, []);

  const handleApplySettings = useCallback(
    async (columnId: string, settings: ColumnSettings, width: number) => {
      handleUpdateColumn(columnId, { settings, width });
      setSettingsColumnId(null);
      const webviewLabel = `column-${columnId}`;
      await invoke("eval_in_webview", {
        label: webviewLabel,
        script: `window.__twitterViewer && window.__twitterViewer.applyAreaRemove(${settings.areaRemoveEnabled});`,
      }).catch(console.error);
      const escaped = settings.customCSS.replace(/`/g, "\\`");
      await invoke("eval_in_webview", {
        label: webviewLabel,
        script: `(function(){var el=document.getElementById('__custom_css__');if(!el){el=document.createElement('style');el.id='__custom_css__';document.head.appendChild(el);}el.textContent=\`${escaped}\`;})();`,
      }).catch(console.error);
      await invoke("eval_in_webview", {
        label: webviewLabel,
        script:
          "window.__twitterViewer && window.__twitterViewer.triggerReload();",
      }).catch(console.error);
    },
    [handleUpdateColumn],
  );

  const handleComposeTweet = useCallback(async () => {
    if (accounts.length === 0) return;
    const targetId = globalSettings.defaultAccountId ?? accounts[0].id;
    const account = accounts.find((a) => a.id === targetId) ?? accounts[0];
    await invoke("open_compose_window", {
      accountId: account.id,
      dataDirectory: account.dataDirectory,
    }).catch(console.error);
  }, [accounts, globalSettings.defaultAccountId]);

  const handleSetDefaultAccount = useCallback(
    (id: string) => {
      updateGlobalSettings({ defaultAccountId: id });
    },
    [updateGlobalSettings],
  );

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.order - b.order),
    [columns],
  );

  if (!isLoaded) {
    return (
      <div className={styles.loading}>
        <span>読み込み中...</span>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <Sidebar
        columns={columns}
        accounts={accounts}
        expanded={sidebarExpanded}
        onToggleExpand={handleToggleSidebar}
        onAddColumn={() => setShowAddColumn(true)}
        onAccountManager={() => setShowAccountManager(true)}
        onAppSettings={() => setShowAppSettings(true)}
        onComposeTweet={handleComposeTweet}
        onJumpToColumn={handleJumpToColumn}
      />

      <div className={styles.appContent} ref={containerRef}>
        {columns.map((column) => {
          const account = accounts.find((a) => a.id === column.accountId);
          const bounds = columnBounds[column.id];
          if (!account || !bounds) return null;
          const idx = sortedColumns.findIndex((c) => c.id === column.id);
          return (
            <div
              key={column.id}
              className={styles.columnHeaderWrapper}
              style={{
                left: bounds.x - sidebarWidth,
                top: bounds.y - HEADER_HEIGHT,
                width: bounds.width,
              }}
            >
              <ColumnHeader
                column={column}
                account={account}
                onReload={handleReload}
                onMoveLeft={(id) => handleMoveColumn(id, "left")}
                onMoveRight={(id) => handleMoveColumn(id, "right")}
                onSettings={setSettingsColumnId}
                onClose={handleRemoveColumn}
                isFirst={idx === 0}
                isLast={idx === sortedColumns.length - 1}
              />
            </div>
          );
        })}

        <div className={styles.webviewArea} />

        <div
          className={styles.bottomScrollbar}
          ref={scrollbarRef}
          onScroll={handleScrollbarScroll}
        >
          <div
            className={styles.bottomScrollbarInner}
            style={{ width: scrollbarWidth }}
          />
        </div>
      </div>

      {showAddColumn && accounts.length > 0 && (
        <AddColumnDialog
          accounts={accounts}
          globalSettings={globalSettings}
          existingColumns={columns}
          onAdd={(column) => {
            handleAddColumn(column);
            setShowAddColumn(false);
          }}
          onCancel={() => setShowAddColumn(false)}
        />
      )}

      {showAddColumn && accounts.length === 0 && (
        <div className={styles.noAccountsPrompt}>
          <p>先にアカウントを追加してください</p>
          <button
            onClick={() => {
              setShowAddColumn(false);
              setShowAccountManager(true);
            }}
          >
            アカウント管理を開く
          </button>
        </div>
      )}

      {showAccountManager && (
        <AccountManager
          accounts={accounts}
          defaultAccountId={globalSettings.defaultAccountId}
          onAddAccount={startAddAccount}
          onRemoveAccount={removeAccount}
          onSetDefault={handleSetDefaultAccount}
          onClose={() => setShowAccountManager(false)}
        />
      )}

      {showAppSettings && (
        <AppSettingsPanel
          settings={globalSettings}
          columns={columns}
          accounts={accounts}
          onApply={updateGlobalSettings}
          onApplyLayout={(updatedColumns) => {
            replaceColumns(updatedColumns);
            recalculateAllBounds();
          }}
          onClose={() => setShowAppSettings(false)}
        />
      )}

      {settingsColumnId &&
        (() => {
          const col = columns.find((c) => c.id === settingsColumnId);
          return col ? (
            <SettingsPanel
              column={col}
              onApply={handleApplySettings}
              onClose={() => setSettingsColumnId(null)}
            />
          ) : null;
        })()}
    </div>
  );
};

export default App;

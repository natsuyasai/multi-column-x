// src/App.tsx
import React, { useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "./store/useAppStore";
import {
  useColumns,
  HEADER_HEIGHT,
  getTopBarHeight,
} from "./hooks/useColumns";
import { useAccounts } from "./hooks/useAccounts";
import { ColumnHeader } from "./components/ColumnHeader/ColumnHeader";
import { AddColumnDialog } from "./components/AddColumnDialog/AddColumnDialog";
import { AccountManager } from "./components/AccountManager/AccountManager";
import { SettingsPanel } from "./components/SettingsPanel/SettingsPanel";
import { AppSettingsPanel } from "./components/AppSettingsPanel/AppSettingsPanel";
import { TopBar } from "./components/TopBar/TopBar";
import { MobileTabBar } from "./components/MobileTabBar/MobileTabBar";
import { TabActionDialog } from "./components/TabActionDialog/TabActionDialog";
import { LinkPopupDialog } from "./components/LinkPopupDialog/LinkPopupDialog";
import { useDialogState } from "./hooks/useDialogState";
import { platform } from "@tauri-apps/plugin-os";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ColumnSettings } from "./types";
import {
  IPC_COMMANDS,
  IPC_EVENTS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "./constants/ipc";
import styles from "./App.module.scss";

const App: React.FC = () => {
  const {
    loadSettings,
    isLoaded,
    accounts,
    globalSettings,
    updateGlobalSettings,
    topBarExpanded,
    setTopBarExpanded,
    replaceColumns,
    isMobile,
    setIsMobile,
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
    activeColumnId,
    swipeState,
    setActiveColumn,
    setDialogOpen,
    recreateAllWebviews,
  } = useColumns();
  const { startAddAccount, removeAccount } = useAccounts();
  const {
    showAddColumn,
    setShowAddColumn,
    showAccountManager,
    setShowAccountManager,
    showAppSettings,
    setShowAppSettings,
    settingsColumnId,
    setSettingsColumnId,
    showLinkPopupDialog,
    setShowLinkPopupDialog,
    tabActionColumnId,
    setTabActionColumnId,
    dialogOpen,
  } = useDialogState();

  const topBarHeight = getTopBarHeight(topBarExpanded);

  const scrollbarWidth = useMemo(() => {
    const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
    return Object.values(columnBounds).reduce(
      (max, b) => Math.max(max, b.x + b.width + scrollLeft),
      0,
    );
  }, [columnBounds, scrollbarRef]);

  // プラットフォーム検出は loadSettings より先に完了させる必要がある。
  // restoreColumns（isLoaded 後に呼ばれる）が isMobile を読むため、
  // setIsMobile は同期的に完了しなければならない。effect の順序を変えないこと。
  useEffect(() => {
    try {
      const mobile = platform() === "android";
      setIsMobile(mobile);
    } catch (e) {
      console.error("platform() failed:", e);
    }
  }, [setIsMobile]);

  useEffect(() => {
    loadSettings();
  }, []);

  // isLoaded が true になった（= DOM レンダリング完了後）タイミングで WebView を復元
  useEffect(() => {
    if (isLoaded) {
      restoreColumns(topBarHeight);
    }
  }, [isLoaded]);

  // ズームレベルをメインUIと実行中カラムWebViewに適用
  useEffect(() => {
    const zoom = globalSettings.zoomLevel ?? 1;
    document.documentElement.style.zoom = String(zoom);
    columns.forEach((column) => {
      invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
        label: WEBVIEW_LABELS.column(column.id),
        script: `document.documentElement.style.zoom='${zoom}';`,
      }).catch(() => {});
    });
  }, [globalSettings.zoomLevel]);

  // WebView 内の横ホイールを受け取ってスクロールバーを動かす
  useEffect(() => {
    const unlisten = listen<number>(IPC_EVENTS.WEBVIEW_SCROLL, (e) => {
      const el = scrollbarRef.current;
      if (el) el.scrollLeft += e.payload;
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [scrollbarRef]);

  const handleOpenLinkPopup = useCallback(() => {
    setShowLinkPopupDialog(true);
  }, []);

  const handleSubmitLinkPopup = useCallback(
    async (url: string, accountId: string) => {
      setShowLinkPopupDialog(false);
      if (!url.trim()) return;
      const resolved = url.startsWith("http") ? url : "https://" + url;
      const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
      if (!account) return;
      await invoke(IPC_COMMANDS.OPEN_LINK_POPUP_WINDOW, {
        webviewLabelCaller: null,
        accountId: account.id,
        dataDirectory: account.dataDirectory,
        url: resolved,
      }).catch(console.error);
    },
    [accounts],
  );

  // ダイアログ表示中は列WebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  useEffect(() => {
    setDialogOpen(dialogOpen);
    if (dialogOpen) {
      hideColumnWebviews();
    } else {
      recalculateAllBounds();
    }
  }, [dialogOpen]);

  const handleToggleTopBar = useCallback(() => {
    setTopBarExpanded(!topBarExpanded);
    setTimeout(() => recalculateAllBounds(), 220);
  }, [topBarExpanded, setTopBarExpanded, recalculateAllBounds]);

  const handleJumpToColumn = useCallback(
    (columnId: string) => {
      const el = scrollbarRef.current;
      if (!el) return;
      const bounds = columnBounds[columnId];
      if (!bounds) return;
      const currentScroll = el.scrollLeft ?? 0;
      el.scrollLeft = currentScroll + bounds.x;
    },
    [columnBounds, scrollbarRef],
  );

  const handleReload = useCallback(async (columnId: string) => {
    await invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
      label: WEBVIEW_LABELS.column(columnId),
      script: WEBVIEW_SCRIPTS.TRIGGER_RELOAD,
    }).catch(console.error);
  }, []);

  const handleApplySettings = useCallback(
    async (columnId: string, settings: ColumnSettings, width: number) => {
      handleUpdateColumn(columnId, { settings, width });
      setSettingsColumnId(null);
      const webviewLabel = WEBVIEW_LABELS.column(columnId);
      await invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
        label: webviewLabel,
        script: WEBVIEW_SCRIPTS.applyAreaRemove(settings.areaRemoveEnabled),
      }).catch(console.error);
      await invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
        label: webviewLabel,
        script: WEBVIEW_SCRIPTS.applyCustomCSS(settings.customCSS),
      }).catch(console.error);
      await invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
        label: webviewLabel,
        script: WEBVIEW_SCRIPTS.TRIGGER_RELOAD,
      }).catch(console.error);
    },
    [handleUpdateColumn],
  );

  const linkPopupDefaultAccountId =
    globalSettings.defaultAccountId ?? accounts[0]?.id ?? "";

  const handleTabAction = useCallback(
    async (columnId: string) => {
      await hideColumnWebviews();
      setTabActionColumnId(columnId);
    },
    [hideColumnWebviews],
  );

  const handleComposeTweet = useCallback(() => {
    if (accounts.length === 0) return;
    const defaultId = globalSettings.defaultAccountId ?? accounts[0].id;
    const account = accounts.find((a) => a.id === defaultId) ?? accounts[0];
    invoke(IPC_COMMANDS.OPEN_COMPOSE_WINDOW, {
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

  const settingsColumn = settingsColumnId
    ? columns.find((c) => c.id === settingsColumnId)
    : undefined;
  const tabActionColumn = tabActionColumnId
    ? columns.find((c) => c.id === tabActionColumnId)
    : undefined;

  if (!isLoaded) {
    return (
      <div className={styles.loading}>
        <span>読み込み中...</span>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {!isMobile && (
        <TopBar
          columns={columns}
          accounts={accounts}
          expanded={topBarExpanded}
          onToggleExpand={handleToggleTopBar}
          onAddColumn={() => setShowAddColumn(true)}
          onAccountManager={() => setShowAccountManager(true)}
          onAppSettings={() => setShowAppSettings(true)}
          onComposeTweet={handleComposeTweet}
          onOpenLinkPopup={handleOpenLinkPopup}
          onJumpToColumn={handleJumpToColumn}
        />
      )}
      {isMobile && (
        <MobileTabBar
          columns={columns}
          accounts={accounts}
          activeColumnId={activeColumnId}
          onSelectColumn={setActiveColumn}
          onMoveLeft={(id) => handleMoveColumn(id, "left")}
          onMoveRight={(id) => handleMoveColumn(id, "right")}
          onAddColumn={() => setShowAddColumn(true)}
          onAccountManager={() => setShowAccountManager(true)}
          onAppSettings={() => setShowAppSettings(true)}
          onOpenLinkPopup={handleOpenLinkPopup}
          onComposeTweet={handleComposeTweet}
          showSortButtons={globalSettings.showSortButtons}
          onTabAction={handleTabAction}
          swipeState={swipeState}
        />
      )}

      <div className={styles.appContent} ref={containerRef}>
        {columns.map((column) => {
          if (isMobile) return null;
          const account = accounts.find((a) => a.id === column.accountId);
          const bounds = columnBounds[column.id];
          if (!account || !bounds) return null;
          const idx = sortedColumns.findIndex((c) => c.id === column.id);
          return (
            <div
              key={column.id}
              className={styles.columnHeaderWrapper}
              style={{
                left: bounds.x,
                top: bounds.y - HEADER_HEIGHT - topBarHeight,
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
                showSortButtons={globalSettings.showSortButtons}
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

      {showLinkPopupDialog && (
        <LinkPopupDialog
          accounts={accounts}
          defaultAccountId={linkPopupDefaultAccountId}
          onSubmit={handleSubmitLinkPopup}
          onClose={() => setShowLinkPopupDialog(false)}
        />
      )}

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
          onApplyColumnDefaults={(patch) => {
            replaceColumns(
              columns.map((col) => ({
                ...col,
                settings: { ...col.settings, ...patch },
              })),
            );
          }}
          onReloadAllWebviews={recreateAllWebviews}
          onClose={() => setShowAppSettings(false)}
        />
      )}

      {settingsColumn && (
        <SettingsPanel
          column={settingsColumn}
          onApply={handleApplySettings}
          onClose={() => setSettingsColumnId(null)}
          isMobile={isMobile}
        />
      )}

      {tabActionColumn && (
        <TabActionDialog
          columnLabel={tabActionColumn.label || tabActionColumn.pageType}
          onSettings={() => {
            setTabActionColumnId(null);
            setSettingsColumnId(tabActionColumn.id);
          }}
          onRemove={() => {
            setTabActionColumnId(null);
            handleRemoveColumn(tabActionColumn.id);
          }}
          onClose={() => setTabActionColumnId(null)}
        />
      )}
    </div>
  );
};

export default App;

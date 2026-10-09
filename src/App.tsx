// src/App.tsx
import { platform } from "@tauri-apps/plugin-os";
import React, {
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./App.module.scss";
import { AccountManager } from "./components/AccountManager/AccountManager";
import { AccountNameDialog } from "./components/AccountNameDialog/AccountNameDialog";
import { AddColumnDialog } from "./components/AddColumnDialog/AddColumnDialog";
import { AppSettingsPanel } from "./components/AppSettingsPanel/AppSettingsPanel";
import { ColumnHeader } from "./components/ColumnHeader/ColumnHeader";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { H264SetupDialog } from "./components/H264SetupDialog/H264SetupDialog";
import { LinkPopupDialog } from "./components/LinkPopupDialog/LinkPopupDialog";
import { MobileTabBar } from "./components/MobileTabBar/MobileTabBar";
import { SettingsPanel } from "./components/SettingsPanel/SettingsPanel";
import { ShortcutHelpDialog } from "./components/ShortcutHelpDialog/ShortcutHelpDialog";
import { TabActionDialog } from "./components/TabActionDialog/TabActionDialog";
import { TopBar } from "./components/TopBar/TopBar";
import { UpdateDialog } from "./components/UpdateDialog/UpdateDialog";
import { WhatsNewDialog } from "./components/WhatsNewDialog/WhatsNewDialog";
import { WEBVIEW_SCRIPTS } from "./constants/ipc";
import { useAccounts } from "./hooks/useAccounts";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useAppUpdater } from "./hooks/useAppUpdater";
import { useColumnNavigation } from "./hooks/useColumnNavigation";
import { useColumns } from "./hooks/useColumns";
import { useDialogState } from "./hooks/useDialogState";
import { useH264Setup } from "./hooks/useH264Setup";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMobileSwipeBarSync } from "./hooks/useMobileSwipeBarSync";
import { usePopupWindowHandlers } from "./hooks/usePopupWindowHandlers";
import { useSettingsApplyHandlers } from "./hooks/useSettingsApplyHandlers";
import { useTheme } from "./hooks/useTheme";
import {
  useApiRateLimitReports,
  useColumnCrashRecovery,
  useColumnFocusClearsUnread,
  useNewPostsNotification,
  useOfficialSettingsBroadcast,
  useOfficialSettingsPopupReload,
  useWebviewScrollRelay,
} from "./hooks/useWebviewEvents";
import { useWhatsNew } from "./hooks/useWhatsNew";
import { HEADER_HEIGHT, getTopBarHeight } from "./lib/gridLayout";
import { evalInColumn } from "./services/columnWebview";
import { useAppStore } from "./store/useAppStore";

const App: React.FC = () => {
  const {
    loadSettings,
    isLoaded,
    accounts,
    globalSettings,
    updateGlobalSettings,
    updateAccount,
    topBarExpanded,
    setTopBarExpanded,
    replaceColumns,
    isMobile,
    setIsMobile,
    setProfileApiSupported,
    unreadCounts,
    setUnreadCount,
    clearUnreadCount,
    setApiRateLimit,
    apiRateLimits,
    settingsLoadNotice,
    dismissSettingsLoadNotice,
  } = useAppStore();
  const {
    columns,
    columnBounds,
    containerRef,
    scrollbarRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleMoveColumnGroup,
    handleUpdateColumn,
    recalculateAllBounds,
    hideColumnWebviews,
    handleScrollbarScroll,
    activeColumnId,
    swipeState,
    setActiveColumn,
    setDialogOpen,
    recreateAllWebviews,
    recreateColumnWebview,
    loadPresetAndRecreateWebviews,
    replaceColumnsAndRecreateWebviews,
  } = useColumns();
  const {
    startAddAccount,
    removeAccount,
    pendingAccountName,
    submitAccountName,
    cancelAccountName,
    pendingRemoval,
    confirmRemoval,
    cancelRemoval,
    startReauth,
    accountNotice,
    dismissAccountNotice,
    retryPendingDataDirectoryDeletions,
  } = useAccounts(recreateAllWebviews);
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
    showOfficialSettingsDialog,
    setShowOfficialSettingsDialog,
    tabActionColumnId,
    setTabActionColumnId,
    showShortcutHelp,
    setShowShortcutHelp,
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

  // 起動時初期化（プラットフォーム検出→設定ロード→バージョン取得→カラム復元→
  // 表示サイズ適用）をまとめたフック。columnsRestored は起動時の更新チェックを
  // 復元完了後にゲートするために使う（UpdateDialog がカラムの裏に隠れるのを防ぐ）。
  const { columnsRestored, appVersion } = useAppBootstrap({
    setIsMobile,
    setProfileApiSupported,
    loadSettings,
    isLoaded,
    restoreColumns,
    topBarHeight,
    columns,
    columnScale: globalSettings.columnScale,
  });
  const updater = useAppUpdater(isMobile, columnsRestored);
  const whatsNew = useWhatsNew(columnsRestored);
  const h264Setup = useH264Setup(columnsRestored);
  // 設定画面の Linux 向け動画再生セクションの表示条件
  const isLinux = useMemo(() => {
    try {
      return !isMobile && platform() === "linux";
    } catch {
      return false;
    }
  }, [isMobile]);
  // 起動時に読み込んだハードウェアデコード設定。設定変更後も再起動までは「再起動後に反映」を出すため保持する
  const [
    startupHardwareVideoDecodeEnabled,
    setStartupHardwareVideoDecodeEnabled,
  ] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    setStartupHardwareVideoDecodeEnabled(
      (prev) => prev ?? globalSettings.hardwareVideoDecodeEnabled,
    );
  }, [isLoaded, globalSettings.hardwareVideoDecodeEnabled]);
  // APIレート制限ポップオーバーの開閉状態（カラムWebView退避判定の anyDialogOpen に含めるため）
  const [apiRateLimitPopoverOpen, setApiRateLimitPopoverOpen] = useState(false);

  // 本体UIのテーマを data-theme 属性へ反映する。戻り値（解決済みテーマ）は
  // モバイルスワイプバーのネイティブオーバーレイ同期にも再利用する（matchMedia 購読の重複を避ける）。
  const resolvedTheme = useTheme(globalSettings.theme);

  // WebView 内の横ホイール → スクロールバー追従、新着カウント → バッジ・デスクトップ通知
  useApiRateLimitReports(setApiRateLimit);
  useColumnCrashRecovery(recreateColumnWebview);
  useColumnFocusClearsUnread(clearUnreadCount);
  useNewPostsNotification(setUnreadCount);
  useOfficialSettingsBroadcast();
  useOfficialSettingsPopupReload(recreateAllWebviews);
  useWebviewScrollRelay(scrollbarRef);

  const handleOpenLinkPopup = useCallback(() => {
    setShowLinkPopupDialog(true);
  }, [setShowLinkPopupDialog]);

  // リンクポップアップ・公式設定ポップアップ・投稿ウィンドウの起動処理をまとめたフック。
  const {
    handleSubmitLinkPopup,
    handleOpenOfficialSettings,
    handleSubmitOfficialSettings,
    handleComposeTweet,
  } = usePopupWindowHandlers({
    accounts,
    defaultAccountId: globalSettings.defaultAccountId,
    setShowLinkPopupDialog,
    setShowAppSettings,
    setShowOfficialSettingsDialog,
  });

  // ダイアログ表示中は列WebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  // 更新ポップアップ・アカウント名入力ダイアログも同様に退避対象に含める。
  const anyDialogOpen =
    dialogOpen ||
    !!updater.available ||
    !!whatsNew.notes ||
    h264Setup.isDialogOpen ||
    !!pendingAccountName ||
    !!pendingRemoval ||
    !!accountNotice ||
    !!settingsLoadNotice ||
    apiRateLimitPopoverOpen;

  // TopBar の開閉で高さが変わったら、DOM 反映直後（描画前）にカラム WebView を追従させる。
  // ダイアログ表示中（WebView 退避中）は閉じたときの復元（anyDialogOpen effect）に任せる。
  // StrictMode の effect 二重実行でもずれないよう、前回値を ref に保持し値が変わったときだけ実行する。
  const prevTopBarExpandedRef = useRef(topBarExpanded);
  useLayoutEffect(() => {
    if (prevTopBarExpandedRef.current === topBarExpanded) return;
    prevTopBarExpandedRef.current = topBarExpanded;
    if (anyDialogOpen) return;
    recalculateAllBounds();
    // topBarExpanded 変化時のみ実行する（他の依存で再実行させない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topBarExpanded]);

  // モバイルスワイプバー（ネイティブオーバーレイ）の状態を Kotlin 側へ同期するフック。
  // (a)(b)(c)(e) の反映タイミングはフック内部に移した。(d)（ダイアログ開閉時の反映）は
  // 下の anyDialogOpen effect から syncMobileSwipeBar を呼ぶ形のまま残す。
  const syncMobileSwipeBar = useMobileSwipeBarSync({
    isMobile,
    columnsRestored,
    globalSettings,
    anyDialogOpen,
    resolvedTheme,
  });

  useEffect(() => {
    setDialogOpen(anyDialogOpen);
    if (anyDialogOpen) {
      hideColumnWebviews();
    } else {
      recalculateAllBounds();
    }
    // (d) ダイアログ開閉時: 開いていれば visible=false になる（syncMobileSwipeBar 内で判定）
    syncMobileSwipeBar();
    // anyDialogOpen 変化時のみ退避/復元する（他の依存で再実行させない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyDialogOpen]);

  const handleToggleTopBar = useCallback(() => {
    setTopBarExpanded(!topBarExpanded);
  }, [topBarExpanded, setTopBarExpanded]);

  // カラムへのジャンプ・手動更新（先頭スクロール＋リロード）をまとめたフック。
  const {
    handleJumpToColumn,
    jumpToColumnWhenReady,
    handleJumpToColumnByIndex,
    handleReload,
    handleReloadFocusedColumn,
    handleDoubleTapColumn,
  } = useColumnNavigation({
    columns,
    columnBounds,
    scrollbarRef,
    dialogOpen,
  });

  const handleOpenAddColumnDialog = useCallback(() => {
    setShowAddColumn(true);
  }, [setShowAddColumn]);

  const handleOpenAccountManager = useCallback(() => {
    setShowAccountManager(true);
  }, [setShowAccountManager]);

  const handleOpenAppSettings = useCallback(() => {
    setShowAppSettings(true);
  }, [setShowAppSettings]);

  const handleToggleShortcutHelp = useCallback(() => {
    setShowShortcutHelp(true);
  }, [setShowShortcutHelp]);

  const handleReloadPage = useCallback(
    async (columnId: string) => {
      // デスクトップ（特に Linux）では WebProcess クラッシュで location.reload が
      // 効かない白画面に陥るため、WebView 自体を作り直して復旧する。
      // モバイル（Android ネイティブ WebView）は従来どおりページ再読み込みで十分。
      if (useAppStore.getState().isMobile) {
        await evalInColumn(columnId, WEBVIEW_SCRIPTS.RELOAD_PAGE);
      } else {
        await recreateColumnWebview(columnId);
      }
    },
    [recreateColumnWebview],
  );

  // カラム個別設定・全体設定の「適用」処理をまとめたフック。
  const { handleApplySettings, handleApplyGlobalSettings } =
    useSettingsApplyHandlers({
      handleUpdateColumn,
      setSettingsColumnId,
      updateGlobalSettings,
    });

  const linkPopupDefaultAccountId =
    globalSettings.defaultAccountId ?? accounts[0]?.id ?? "";

  const handleTabAction = useCallback(
    async (columnId: string) => {
      await hideColumnWebviews();
      setTabActionColumnId(columnId);
    },
    [hideColumnWebviews, setTabActionColumnId],
  );

  useKeyboardShortcuts({
    onComposeTweet: handleComposeTweet,
    onOpenLinkPopup: handleOpenLinkPopup,
    onAddColumn: handleOpenAddColumnDialog,
    onAccountManager: handleOpenAccountManager,
    onAppSettings: handleOpenAppSettings,
    onToggleTopBar: handleToggleTopBar,
    onJumpToColumn: handleJumpToColumnByIndex,
    onReloadColumn: handleReloadFocusedColumn,
    onToggleHelp: handleToggleShortcutHelp,
    disabled: dialogOpen,
  });

  const handleSetDefaultAccount = useCallback(
    (id: string) => {
      updateGlobalSettings({ defaultAccountId: id });
    },
    [updateGlobalSettings],
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
          onClose={handleRemoveColumn}
          onReorderColumnGroup={handleMoveColumnGroup}
          apiRateLimitMonitorEnabled={globalSettings.apiRateLimitMonitorEnabled}
          apiRateLimits={apiRateLimits}
          onApiRateLimitPopoverOpenChange={setApiRateLimitPopoverOpen}
        />
      )}
      {isMobile && (
        <MobileTabBar
          columns={columns}
          accounts={accounts}
          activeColumnId={activeColumnId}
          onSelectColumn={setActiveColumn}
          onAddColumn={() => setShowAddColumn(true)}
          onAccountManager={() => setShowAccountManager(true)}
          onAppSettings={() => setShowAppSettings(true)}
          onOpenLinkPopup={handleOpenLinkPopup}
          onComposeTweet={handleComposeTweet}
          onTabAction={handleTabAction}
          onDoubleTapColumn={handleDoubleTapColumn}
          swipeState={swipeState}
          apiRateLimitMonitorEnabled={globalSettings.apiRateLimitMonitorEnabled}
          apiRateLimits={apiRateLimits}
          onApiRateLimitPopoverOpenChange={setApiRateLimitPopoverOpen}
        />
      )}
      <div className={styles.appContent} ref={containerRef}>
        {columns.map((column) => {
          if (isMobile) return null;
          const account = accounts.find((a) => a.id === column.accountId);
          const bounds = columnBounds[column.id];
          if (!bounds) return null;
          if (column.pageType !== "external" && !account) return null;
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
                onReloadPage={handleReloadPage}
                onScrollTop={handleDoubleTapColumn}
                onSettings={setSettingsColumnId}
                onClose={handleRemoveColumn}
                unreadCount={unreadCounts[column.id] ?? 0}
                onClearUnread={clearUnreadCount}
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

      {showOfficialSettingsDialog && (
        <LinkPopupDialog
          accounts={accounts}
          defaultAccountId={linkPopupDefaultAccountId}
          fixedUrl="https://x.com/settings"
          title="公式設定を開く"
          onSubmit={handleSubmitOfficialSettings}
          onClose={() => setShowOfficialSettingsDialog(false)}
        />
      )}

      {showAddColumn && accounts.length > 0 && (
        <AddColumnDialog
          accounts={accounts}
          globalSettings={globalSettings}
          existingColumns={columns}
          onAdd={(column) => {
            const added = handleAddColumn(column);
            setShowAddColumn(false);
            // デスクトップでは追加成功後に新カラムへ横スクロールする（mobile は追加時にアクティブ化済み）
            void added.then((ok) => {
              if (ok && !useAppStore.getState().isMobile) {
                jumpToColumnWhenReady(column.id);
              }
            });
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
          onUpdateAccount={updateAccount}
          onClose={() => setShowAccountManager(false)}
          onReauthAccount={startReauth}
        />
      )}

      {pendingAccountName && (
        <AccountNameDialog
          defaultValue={pendingAccountName.defaultValue}
          title="アカウント名を入力"
          onSubmit={submitAccountName}
          onCancel={cancelAccountName}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="アカウントの削除"
          message={`「${pendingRemoval.label}」を削除しますか？セッションデータも削除されます。`}
          confirmLabel="削除する"
          onConfirm={confirmRemoval}
          onCancel={cancelRemoval}
        />
      )}

      {accountNotice && (
        <ConfirmDialog
          singleButton
          title={accountNotice.title}
          message={accountNotice.message}
          confirmLabel="OK"
          onConfirm={dismissAccountNotice}
          onCancel={dismissAccountNotice}
        />
      )}

      {settingsLoadNotice && (
        <ConfirmDialog
          singleButton
          title="設定の読み込みに失敗しました"
          message={settingsLoadNotice}
          confirmLabel="OK"
          onConfirm={dismissSettingsLoadNotice}
          onCancel={dismissSettingsLoadNotice}
        />
      )}

      {showAppSettings && (
        <AppSettingsPanel
          settings={globalSettings}
          columns={columns}
          accounts={accounts}
          onApply={handleApplyGlobalSettings}
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
          onLoadPreset={loadPresetAndRecreateWebviews}
          onReplaceColumnsAndRecreate={replaceColumnsAndRecreateWebviews}
          appVersion={appVersion}
          updateChecking={updater.checking}
          updateManualResult={updater.manualResult}
          onCheckUpdate={updater.checkManually}
          onOpenOfficialSettings={handleOpenOfficialSettings}
          onClose={() => setShowAppSettings(false)}
          pendingDataDirectoryDeletionCount={
            globalSettings.pendingDataDirectoryDeletions.length
          }
          onRetryDataDirectoryDeletion={retryPendingDataDirectoryDeletions}
          isLinux={isLinux}
          startupHardwareVideoDecodeEnabled={
            startupHardwareVideoDecodeEnabled ?? undefined
          }
          h264Setup={{
            downloadApplicable: h264Setup.downloadApplicable,
            h264Available: h264Setup.h264Available,
            downloadState: h264Setup.downloadState,
            downloadError: h264Setup.downloadError,
            onEnable: h264Setup.openFromSettings,
            onRelaunch: h264Setup.relaunchApp,
          }}
        />
      )}

      {settingsColumn && (
        <SettingsPanel
          column={settingsColumn}
          onApply={handleApplySettings}
          onClose={() => setSettingsColumnId(null)}
          onReload={handleReload}
          isMobile={isMobile}
        />
      )}

      {tabActionColumn && (
        <TabActionDialog
          columnLabel={tabActionColumn.label || tabActionColumn.pageType}
          onReload={() => {
            setTabActionColumnId(null);
            handleReloadPage(tabActionColumn.id);
          }}
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

      {updater.available && (
        <UpdateDialog
          update={updater.available}
          installing={updater.installing}
          progress={updater.progress}
          installError={updater.installError}
          onInstall={updater.install}
          onLater={updater.dismiss}
        />
      )}

      {whatsNew.notes && (
        <WhatsNewDialog
          version={appVersion}
          notes={whatsNew.notes}
          onClose={whatsNew.dismiss}
        />
      )}

      {h264Setup.isDialogOpen && (
        <H264SetupDialog
          downloadState={h264Setup.downloadState}
          downloadError={h264Setup.downloadError}
          onDownload={h264Setup.download}
          onDismiss={h264Setup.dismiss}
          onClose={h264Setup.close}
          onRelaunch={h264Setup.relaunchApp}
        />
      )}

      {showShortcutHelp && (
        <ShortcutHelpDialog onClose={() => setShowShortcutHelp(false)} />
      )}
    </div>
  );
};

export default App;

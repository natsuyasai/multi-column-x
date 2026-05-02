// src/App.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAppStore } from "./store/useAppStore";
import { useColumns } from "./hooks/useColumns";
import { useAccounts } from "./hooks/useAccounts";
import { ColumnHeader } from "./components/ColumnHeader/ColumnHeader";
import { AddColumnDialog } from "./components/AddColumnDialog/AddColumnDialog";
import { AccountManager } from "./components/AccountManager/AccountManager";
import { SettingsPanel } from "./components/SettingsPanel/SettingsPanel";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ColumnSettings } from "./types";
import styles from "./App.module.scss";

const App: React.FC = () => {
  const { loadSettings, isLoaded, accounts } = useAppStore();
  const {
    columns,
    containerRef,
    scrollRef,
    scrollbarRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleMoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
    hideColumnWebviews,
    handleHeaderScroll,
    handleScrollbarScroll,
  } = useColumns();
  const { startAddAccount, removeAccount } = useAccounts();

  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const scrollbarWidth = useMemo(() => {
    const columnsWidth = columns.reduce((sum, c) => sum + c.width, 0);
    if (!toolbarRef.current) return columnsWidth;
    const toolbarWidth = toolbarRef.current.offsetWidth;
    return columnsWidth + toolbarWidth;
  }, [toolbarRef, columns]);

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [settingsColumnId, setSettingsColumnId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then(() => {
      restoreColumns();
    });
  }, []);

  // WebView 内の横ホイールを受け取ってスクロールバーを動かす
  useEffect(() => {
    const unlisten = listen<number>("webview-scroll", (e) => {
      const el = scrollbarRef.current;
      if (el) el.scrollLeft += e.payload;
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ダイアログ表示中は列WebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  const dialogOpen = showAddColumn || showAccountManager || !!settingsColumnId;
  useEffect(() => {
    if (dialogOpen) {
      hideColumnWebviews();
    } else {
      recalculateAllBounds();
    }
  }, [dialogOpen]);

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
    },
    [handleUpdateColumn],
  );

  if (!isLoaded) {
    return (
      <div className={styles.loading}>
        <span>読み込み中...</span>
      </div>
    );
  }

  return (
    <div className={styles.app} ref={containerRef}>
      <div
        className={styles.headerRow}
        onWheel={(e) => {
          const el = scrollbarRef.current;
          if (!el) return;
          el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
        }}
      >
        <div
          className={styles.columnHeaders}
          ref={scrollRef}
          onScroll={handleHeaderScroll}
        >
          {(() => {
            const sorted = columns.slice().sort((a, b) => a.order - b.order);
            return sorted.map((column, idx) => {
              const account = accounts.find((a) => a.id === column.accountId);
              if (!account) return null;
              return (
                <div
                  key={column.id}
                  style={{ width: column.width, flexShrink: 0 }}
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
                    isLast={idx === sorted.length - 1}
                  />
                </div>
              );
            });
          })()}
        </div>

        <div className={styles.toolbar} ref={toolbarRef}>
          <button
            className={styles.toolbarBtn}
            onClick={() => setShowAddColumn(true)}
            title="カラムを追加"
            aria-label="カラムを追加"
          >
            +
          </button>
          <button
            className={styles.toolbarBtn}
            onClick={() => setShowAccountManager(true)}
            title="アカウント管理"
            aria-label="アカウント管理"
          >
            👤
          </button>
        </div>
      </div>

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

      {showAddColumn && accounts.length > 0 && (
        <AddColumnDialog
          accounts={accounts}
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
          onAddAccount={startAddAccount}
          onRemoveAccount={removeAccount}
          onClose={() => setShowAccountManager(false)}
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

// src/hooks/useWebviewEvents.ts
// カラム WebView から emit されるイベントの listen をまとめたフック
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { IPC_EVENTS, WEBVIEW_LABELS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";

/** WebView 内の横ホイールを受け取ってスクロールバーを動かす */
export function useWebviewScrollRelay(
  scrollbarRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const unlisten = listen<number>(IPC_EVENTS.WEBVIEW_SCROLL, (e) => {
      const el = scrollbarRef.current;
      if (el) el.scrollLeft += e.payload;
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [scrollbarRef]);
}

/**
 * 同一カラムのクラッシュ再生成を抑制するクールダウン（ms）。
 * 起動直後に必ずクラッシュするページなどで、再生成→クラッシュの無限ループに
 * 陥らないようにするためのガード。
 */
export const CRASH_RECOVERY_COOLDOWN_MS = 5000;

/**
 * カラム WebView の WebProcess クラッシュ（Linux）を検知して当該カラムを再生成する。
 * Rust が connect_web_process_terminated で emit する column-webview-crashed を listen する。
 */
export function useColumnCrashRecovery(
  recreateColumnWebview: (columnId: string) => void | Promise<void>,
) {
  useEffect(() => {
    const lastRecreatedAt: Record<string, number> = {};
    const unlisten = listen<string>(IPC_EVENTS.COLUMN_WEBVIEW_CRASHED, (e) => {
      const columnId = e.payload;
      const now = Date.now();
      const last = lastRecreatedAt[columnId];
      if (last !== undefined && now - last < CRASH_RECOVERY_COOLDOWN_MS) {
        return;
      }
      lastRecreatedAt[columnId] = now;
      void recreateColumnWebview(columnId);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [recreateColumnWebview]);
}

/** inject script からの新着カウントでバッジ更新、通知カラムはデスクトップ通知 */
export function useNewPostsNotification(
  setUnreadCount: (columnId: string, count: number) => void,
) {
  useEffect(() => {
    const unlisten = listen<{ label: string; count: number }>(
      IPC_EVENTS.WEBVIEW_NEW_POSTS_COUNT,
      (e) => {
        const { label, count } = e.payload;
        const columnId = label.replace(WEBVIEW_LABELS.COLUMN_PREFIX, "");
        setUnreadCount(columnId, count);

        const col = useAppStore
          .getState()
          .columns.find((c) => c.id === columnId);
        if (
          col?.pageType === "notifications" &&
          col.settings.autoReloadEnabled &&
          count > 0 &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("新着通知", {
            body: `${count}件の新しい通知があります`,
          });
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setUnreadCount]);
}

// src/hooks/useWebviewEvents.ts
// カラム WebView から emit されるイベントの listen をまとめたフック
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/useAppStore";
import { IPC_EVENTS, WEBVIEW_LABELS } from "../constants/ipc";

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

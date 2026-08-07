// src/hooks/useWebviewEvents.ts
// カラム WebView から emit されるイベントの listen をまとめたフック
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect } from "react";
import { IPC_EVENTS, WEBVIEW_LABELS } from "../constants/ipc";
import { logError } from "../lib/log";
import { useAppStore } from "../store/useAppStore";
import { getColumnLabel } from "../types";
import type { ApiRateLimitBucket } from "../types";

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
 * 同一カラムを自動再生成する連続試行の上限。これを超えたら自動復旧を諦め手動再読込に委ねる。
 */
export const MAX_CRASH_RECOVERY_ATTEMPTS = 3;

/**
 * 直近再生成からこの時間以上安定して稼働していたら、次のクラッシュは新規事象として
 * 試行回数をリセットする（スリープ復帰など）。
 */
export const CRASH_RECOVERY_STABILITY_RESET_MS = 60000;

interface CrashRecoveryRecord {
  attempts: number;
  lastRecreatedAt: number;
}

/**
 * カラム WebView の WebProcess クラッシュ（Linux）を検知して当該カラムを再生成する。
 * Rust が connect_web_process_terminated で emit する column-webview-crashed を listen する。
 *
 * 連続再生成には上限（MAX_CRASH_RECOVERY_ATTEMPTS）を設け、上限到達後は自動復旧を諦める。
 * 最後の再生成から CRASH_RECOVERY_STABILITY_RESET_MS 以上安定していた場合は、
 * 新規のクラッシュ事象とみなして試行回数をリセットする（バックオフからの復帰）。
 */
export function useColumnCrashRecovery(
  recreateColumnWebview: (columnId: string) => void | Promise<void>,
) {
  useEffect(() => {
    const records: Record<string, CrashRecoveryRecord> = {};
    const unlisten = listen<string>(IPC_EVENTS.COLUMN_WEBVIEW_CRASHED, (e) => {
      const columnId = e.payload;
      const now = Date.now();
      const record = records[columnId];

      if (record !== undefined) {
        const elapsed = now - record.lastRecreatedAt;
        if (elapsed < CRASH_RECOVERY_COOLDOWN_MS) {
          return;
        }
        if (elapsed >= CRASH_RECOVERY_STABILITY_RESET_MS) {
          record.attempts = 0;
        }
        if (record.attempts >= MAX_CRASH_RECOVERY_ATTEMPTS) {
          logError("useColumnCrashRecovery")(
            new Error(
              `column ${columnId} crashed ${record.attempts} times consecutively; giving up auto-recovery until it stabilizes`,
            ),
          );
          return;
        }
      }

      const next = records[columnId] ?? { attempts: 0, lastRecreatedAt: now };
      next.attempts += 1;
      next.lastRecreatedAt = now;
      records[columnId] = next;
      void recreateColumnWebview(columnId);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [recreateColumnWebview]);
}

/**
 * カラム WebView がOSフォーカスを得た（Windowsのみ発火）ことを検知して、
 * 対象カラムの未読バッジを自動的にクリアする。
 * Rust が WebView2 の GotFocus イベントから emit する column-webview-focused を listen する。
 */
export function useColumnFocusClearsUnread(
  clearUnreadCount: (columnId: string) => void,
) {
  useEffect(() => {
    const unlisten = listen<string>(IPC_EVENTS.COLUMN_WEBVIEW_FOCUSED, (e) => {
      clearUnreadCount(e.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [clearUnreadCount]);
}

/**
 * 通知許可のリクエスト試行済みフラグ（モジュールレベルでキャッシュ）。
 * 一度リクエストして拒否された場合、新着のたびに OS 許可ダイアログを
 * 繰り返し要求しないようにするためのガード。
 * OS 設定側で後から許可された場合は isPermissionGranted() が true を返すため
 * このフラグに関わらず通知は送信される。
 */
let hasRequestedNotificationPermission = false;

/**
 * テスト専用: モジュールレベルの許可リクエスト試行済みフラグをリセットする。
 * 本体コードから呼び出してはいけない。
 */
export function __resetNotificationPermissionCacheForTests(): void {
  hasRequestedNotificationPermission = false;
}

/** 通知を送る直前に許可状態を確認し、未許可なら一度だけ許可をリクエストする */
async function ensureNotificationPermissionGranted(): Promise<boolean> {
  if (await isPermissionGranted()) {
    return true;
  }
  if (hasRequestedNotificationPermission) {
    return false;
  }
  hasRequestedNotificationPermission = true;
  const permission = await requestPermission();
  return permission === "granted";
}

async function notifyNewPosts(columnName: string): Promise<void> {
  const granted = await ensureNotificationPermissionGranted();
  if (!granted) return;
  sendNotification({
    title: "新着通知",
    body: `${columnName}に新着があります`,
  });
}

/** inject script からの新着カウントを受け、desktopNotifyEnabled が有効なカラムのみバッジ更新とデスクトップ通知を行う */
export function useNewPostsNotification(
  setUnreadCount: (columnId: string, count: number) => void,
) {
  useEffect(() => {
    const unlisten = listen<{ label: string; count: number }>(
      IPC_EVENTS.WEBVIEW_NEW_POSTS_COUNT,
      (e) => {
        const { label, count } = e.payload;
        const columnId = label.replace(WEBVIEW_LABELS.COLUMN_PREFIX, "");

        const col = useAppStore
          .getState()
          .columns.find((c) => c.id === columnId);
        if (!col?.settings.desktopNotifyEnabled) return;

        setUnreadCount(columnId, count);

        if (col.settings.autoReloadEnabled && count > 0) {
          const columnName = getColumnLabel(col);
          void notifyNewPosts(columnName);
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setUnreadCount]);
}

/** inject script からのAPIレート制限ヘッダ通知を受け、当該カラムのaccountIdに紐づけてstoreへ反映する */
export function useApiRateLimitReports(
  setApiRateLimit: (accountId: string, bucket: ApiRateLimitBucket) => void,
) {
  useEffect(() => {
    const unlisten = listen<{
      label: string;
      bucketKey: string;
      limit: number;
      remaining: number;
      reset: number;
    }>(IPC_EVENTS.WEBVIEW_API_RATE_LIMIT, (e) => {
      const { label, bucketKey, limit, remaining, reset } = e.payload;
      const columnId = label.replace(WEBVIEW_LABELS.COLUMN_PREFIX, "");

      const col = useAppStore.getState().columns.find((c) => c.id === columnId);
      if (!col) return;

      setApiRateLimit(col.accountId, {
        bucketKey,
        limit,
        remaining,
        reset,
        updatedAt: Date.now(),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setApiRateLimit]);
}

// src/hooks/useWebviewEvents.ts
// カラム WebView から emit されるイベントの listen をまとめたフック
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect } from "react";
import {
  IPC_EVENTS,
  OFFICIAL_SETTINGS_WHITELIST_KEYS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "../constants/ipc";
import { logError } from "../lib/log";
import { evalInColumn } from "../services/columnWebview";
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

/**
 * inject script からのAPIレート制限ヘッダ通知を受け、Rust側（WebviewRegistry / ComposeSession）が
 * 解決したaccountIdに紐づけてstoreへ反映する。
 * カラムWebViewだけでなく常駐コンポーズWebView経由の投稿もaccountIdを取りこぼさない。
 */
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
      accountId: string | null;
    }>(IPC_EVENTS.WEBVIEW_API_RATE_LIMIT, (e) => {
      const { bucketKey, limit, remaining, reset, accountId } = e.payload;
      if (!accountId) return;

      setApiRateLimit(accountId, {
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

/**
 * ポップアップ内「各カラムに適用」ボタンから届いた公式設定スナップショットを受け、
 * 配布元以外の各アカウントの代表カラム（compose/externalを除く先頭カラム。無ければ任意の1つ）
 * へ書き込み、リロードして反映する。配布元アカウント自身のカラムは、ポップアップと同じ
 * dataDirectory（＝同じIndexedDB）を共有しており書き込み済みのため、書き込みはせず
 * リロードのみ実行して表示を最新化する。
 *
 * snapshot は x.com 側スクリプトが report_official_settings 経由で送ってくる文字列であり、
 * report_official_settings 自体は require_main_caller を持たない（ポップアップから呼ぶため）。
 * そのため任意の文字列が届き得る前提で、ここで JSON.parse による検証を行い、さらに
 * OFFICIAL_SETTINGS_WHITELIST_KEYS で再フィルタしたオブジェクトを再 JSON.stringify した
 * 安全な文字列のみを eval_in_webview に渡す（popup_toolbar.ts 側の絞り込みを信用せず、
 * 受信側でも同じホワイトリストを適用する多層防御）。nightMode は Cookie "night_mode" へ
 * 直接埋め込まれるため、型チェックではなく既知の値("0"/"1"/"2"/null)のみを許可する
 * allowlist で検証する（Cookie属性インジェクション対策）。
 */
export function useOfficialSettingsBroadcast() {
  useEffect(() => {
    const unlisten = listen<{ accountId: string; snapshot: string }>(
      IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED,
      (e) => {
        const { accountId: sourceAccountId, snapshot } = e.payload;
        let parsed: unknown;
        try {
          parsed = JSON.parse(snapshot);
        } catch {
          return; // 不正なペイロードは配布しない
        }
        if (typeof parsed !== "object" || parsed === null) return;
        const parsedObj = parsed as Record<string, unknown>;
        const incomingLocal =
          typeof parsedObj.local === "object" && parsedObj.local !== null
            ? (parsedObj.local as Record<string, unknown>)
            : {};
        const whitelistedLocal: Record<string, unknown> = {};
        for (const key of OFFICIAL_SETTINGS_WHITELIST_KEYS) {
          if (Object.prototype.hasOwnProperty.call(incomingLocal, key)) {
            whitelistedLocal[key] = incomingLocal[key];
          }
        }
        // nightMode は Cookie "night_mode" へ直接埋め込まれるため、型チェックではなく
        // 既知の値のみを許可する allowlist で検証する（Cookie属性インジェクション対策）。
        // "0"=デフォルト/"2"=ブラックを実観測、"1"=dim相当は未観測だが値域として許容。
        const nightMode = (["0", "1", "2", null] as (string | null)[]).includes(
          parsedObj.nightMode as string | null,
        )
          ? (parsedObj.nightMode as string | null)
          : undefined;
        const safeSnapshotJson = JSON.stringify({
          local: whitelistedLocal,
          nightMode,
        });

        const { accounts, columns } = useAppStore.getState();
        accounts.forEach((account) => {
          const targetColumns = columns.filter(
            (c) => c.accountId === account.id,
          );
          const col =
            targetColumns.find(
              (c) => c.pageType !== "compose" && c.pageType !== "external",
            ) ?? targetColumns[0];
          if (!col) return;

          if (account.id === sourceAccountId) {
            // 配布元は同じ dataDirectory を共有しており書き込み済み。表示だけ最新化する。
            void evalInColumn(col.id, WEBVIEW_SCRIPTS.TRIGGER_RELOAD);
            return;
          }
          void evalInColumn(
            col.id,
            WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(safeSnapshotJson),
          );
        });
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}

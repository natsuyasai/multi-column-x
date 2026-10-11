import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IPC_COMMANDS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";

interface UseAutoReloadOptions {
  columnId: string;
  enabled: boolean;
  intervalSec: number;
}

interface UseAutoReloadResult {
  remaining: number | null; // null = 自動更新無効
  reset: () => void; // 手動更新時にカウントをリセット
}

export function useAutoReload({
  columnId,
  enabled,
  intervalSec,
}: UseAutoReloadOptions): UseAutoReloadResult {
  const [remaining, setRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 残り秒数の正（setInterval のコールバックから読む）。state は表示用。
  const remainingRef = useRef<number | null>(null);
  const intervalSecRef = useRef(intervalSec);
  intervalSecRef.current = intervalSec;

  const startTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
    }
    remainingRef.current = intervalSecRef.current;
    setRemaining(remainingRef.current);
    timerRef.current = setInterval(() => {
      const prev = remainingRef.current;
      if (prev === null) return;
      if (prev <= 1) {
        // バックアップ復元中は WebView の破棄・再生成と競合するため更新しない（カウントは続ける）。
        // 状態更新関数の外で呼ぶ（StrictMode の開発ビルドでは更新関数が 2 回実行されるため）
        if (!useAppStore.getState().restoreInProgress) {
          invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
            label: WEBVIEW_LABELS.column(columnId),
            script: WEBVIEW_SCRIPTS.TRIGGER_RELOAD,
          }).catch(() => {});
        }
        remainingRef.current = intervalSecRef.current;
      } else {
        remainingRef.current = prev - 1;
      }
      setRemaining(remainingRef.current);
    }, 1000);
  }, [columnId]);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled || intervalSec <= 0) {
      remainingRef.current = null;
      setRemaining(null);
      return;
    }
    startTimer();
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [columnId, enabled, intervalSec, startTimer]);

  const reset = useCallback(() => {
    if (!enabled || intervalSec <= 0) return;
    startTimer();
  }, [enabled, intervalSec, startTimer]);

  return { remaining, reset };
}

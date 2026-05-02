import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface UseAutoReloadOptions {
  columnId: string;
  enabled: boolean;
  intervalSec: number;
}

interface UseAutoReloadResult {
  remaining: number | null; // null = 自動更新無効
  reset: () => void;        // 手動更新時にカウントをリセット
}

export function useAutoReload({ columnId, enabled, intervalSec }: UseAutoReloadOptions): UseAutoReloadResult {
  const [remaining, setRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalSecRef = useRef(intervalSec);
  intervalSecRef.current = intervalSec;

  const startTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
    }
    setRemaining(intervalSecRef.current);
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          invoke('eval_in_webview', {
            label: `column-${columnId}`,
            script: 'window.__twitterViewer && window.__twitterViewer.triggerReload();',
          }).catch(() => {});
          return intervalSecRef.current;
        }
        return prev - 1;
      });
    }, 1000);
  }, [columnId]);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled || intervalSec <= 0) {
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORAGE_KEYS } from "../constants/ipc";
import { logError } from "../lib/log";
import { shouldAutoPrompt } from "../lib/updatePrompt";
import { createUpdater, type AppUpdate } from "../services/updater";

type ManualResult = "idle" | "none" | "error";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.DISMISSED_UPDATE_VERSION);
  } catch {
    return null;
  }
}

export function useAppUpdater(isMobile: boolean) {
  const updater = useMemo(() => createUpdater(isMobile), [isMobile]);
  const [available, setAvailable] = useState<AppUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [manualResult, setManualResult] = useState<ManualResult>("idle");
  const startedRef = useRef(false);

  // 起動時に一度だけ自動チェックする。見送り済みバージョンは表示しない。
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setChecking(true);
    updater
      .check()
      .then((upd) => {
        if (upd && shouldAutoPrompt(upd.version, readDismissed())) {
          setAvailable(upd);
        }
      })
      .catch(logError("useAppUpdater:startupCheck"))
      .finally(() => setChecking(false));
  }, [updater]);

  // 手動チェック。見送り記録を無視して結果を表示する。
  const checkManually = useCallback(async () => {
    setChecking(true);
    setManualResult("idle");
    try {
      const upd = await updater.check();
      if (upd) {
        setAvailable(upd);
      } else {
        setManualResult("none");
      }
    } catch (e) {
      logError("useAppUpdater:checkManually")(e);
      setManualResult("error");
    } finally {
      setChecking(false);
    }
  }, [updater]);

  const install = useCallback(async () => {
    setInstalling(true);
    try {
      await updater.install();
    } catch (e) {
      logError("useAppUpdater:install")(e);
    } finally {
      setInstalling(false);
    }
  }, [updater]);

  // 「後で」: 該当バージョンを見送り記録し、ダイアログを閉じる。
  const dismiss = useCallback(() => {
    if (available) {
      try {
        localStorage.setItem(
          STORAGE_KEYS.DISMISSED_UPDATE_VERSION,
          available.version,
        );
      } catch {}
    }
    setAvailable(null);
  }, [available]);

  return {
    available,
    checking,
    installing,
    manualResult,
    checkManually,
    install,
    dismiss,
  };
}

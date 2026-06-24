import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORAGE_KEYS } from "../constants/ipc";
import { logError } from "../lib/log";
import { shouldAutoPrompt } from "../lib/updatePrompt";
import {
  createUpdater,
  type AppUpdate,
  type Updater,
  type UpdateProgress,
} from "../services/updater";

type ManualResult = "idle" | "none" | "error";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.DISMISSED_UPDATE_VERSION);
  } catch {
    return null;
  }
}

export function useAppUpdater(isMobile: boolean, ready: boolean = true) {
  const updater = useMemo(() => createUpdater(isMobile), [isMobile]);
  const [available, setAvailable] = useState<AppUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [manualResult, setManualResult] = useState<ManualResult>("idle");

  // updater インスタンスごとに一度、起動時の自動チェックを行う。見送り済みバージョンは表示しない。
  // isMobile が確定して updater が mobile 実装へ切り替わった際にも確実にチェックするため、
  // started 判定は updater 単位で持つ（false→true 切替で再チェックされる）。
  // ready が false の間はチェックしない（カラム復元前に UpdateDialog がネイティブ WebView の裏へ
  // 隠れるのを防ぐため、復元完了で ready=true になってから初めてチェックする）。
  const checkedUpdaterRef = useRef<Updater | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (checkedUpdaterRef.current === updater) return;
    checkedUpdaterRef.current = updater;
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
  }, [updater, ready]);

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
    setProgress(null);
    try {
      await updater.install((p) => setProgress(p));
    } catch (e) {
      logError("useAppUpdater:install")(e);
    } finally {
      setInstalling(false);
      setProgress(null);
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
    progress,
    manualResult,
    checkManually,
    install,
    dismiss,
  };
}

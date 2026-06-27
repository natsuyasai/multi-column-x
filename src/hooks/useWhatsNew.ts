import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "../constants/ipc";
import { fetchReleaseNotes } from "../lib/githubRelease";
import { logError } from "../lib/log";
import { isNewerVersion } from "../lib/version";

export function useWhatsNew(ready: boolean = true) {
  const [notes, setNotes] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      let current: string | undefined;
      try {
        current = await getVersion();

        let lastSeen: string | null;
        try {
          lastSeen = localStorage.getItem(STORAGE_KEYS.LAST_SEEN_VERSION);
        } catch {
          lastSeen = null;
        }

        if (lastSeen !== null && isNewerVersion(current, lastSeen)) {
          const releaseNotes = await fetchReleaseNotes(current);
          if (releaseNotes) {
            setNotes(releaseNotes);
          }
        }
      } catch (e) {
        logError("useWhatsNew:check")(e);
      } finally {
        if (current !== undefined) {
          try {
            localStorage.setItem(STORAGE_KEYS.LAST_SEEN_VERSION, current);
          } catch {}
        }
      }
    })();
  }, [ready]);

  const dismiss = useCallback(() => {
    setNotes(null);
  }, []);

  return { notes, dismiss };
}

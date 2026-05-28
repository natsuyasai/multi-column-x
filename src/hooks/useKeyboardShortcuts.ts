import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { IPC_EVENTS } from "../constants/ipc";

interface KeyboardShortcutsOptions {
  onComposeTweet: () => void;
}

export function useKeyboardShortcuts({
  onComposeTweet,
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "t") {
        onComposeTweet();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onComposeTweet]);

  useEffect(() => {
    let active = true;
    const unlisten = listen<string>(
      IPC_EVENTS.WEBVIEW_KEYBOARD_SHORTCUT,
      (e) => {
        if (!active) return;
        if (e.payload === "compose_tweet") {
          onComposeTweet();
        }
      },
    );
    return () => {
      active = false;
      unlisten.then((fn) => fn());
    };
  }, [onComposeTweet]);
}

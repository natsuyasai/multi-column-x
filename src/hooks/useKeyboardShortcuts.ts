import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { IPC_EVENTS } from "../constants/ipc";

const NOOP = () => {};
const NOOP_INDEX = (_index: number) => {};

interface KeyboardShortcutsOptions {
  onComposeTweet: () => void;
  onOpenLinkPopup?: () => void;
  onAddColumn?: () => void;
  onAccountManager?: () => void;
  onAppSettings?: () => void;
  onToggleTopBar?: () => void;
  onJumpToColumn?: (index: number) => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onComposeTweet,
  onOpenLinkPopup = NOOP,
  onAddColumn = NOOP,
  onAccountManager = NOOP,
  onAppSettings = NOOP,
  onToggleTopBar = NOOP,
  onJumpToColumn = NOOP_INDEX,
  disabled = false,
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "t") {
        onComposeTweet();
        return;
      }
      if (key === "l") {
        onOpenLinkPopup();
        return;
      }
      if (key === "n") {
        onAddColumn();
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onComposeTweet, onOpenLinkPopup, onAddColumn, disabled]);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    const unlisten = listen<string>(
      IPC_EVENTS.WEBVIEW_KEYBOARD_SHORTCUT,
      (e) => {
        if (!active) return;
        switch (e.payload) {
          case "compose_tweet":
            onComposeTweet();
            break;
          case "open_link_popup":
            onOpenLinkPopup();
            break;
          case "add_column":
            onAddColumn();
            break;
        }
      },
    );
    return () => {
      active = false;
      unlisten.then((fn) => fn());
    };
  }, [onComposeTweet, onOpenLinkPopup, onAddColumn, disabled]);
}

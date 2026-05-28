import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { IPC_EVENTS } from "../constants/ipc";

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
  onOpenLinkPopup = () => {},
  onAddColumn = () => {},
  onAccountManager = () => {},
  onAppSettings = () => {},
  onToggleTopBar = () => {},
  onJumpToColumn = () => {},
  disabled = false,
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "t") {
        onComposeTweet();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onComposeTweet,
    onOpenLinkPopup,
    onAddColumn,
    onAccountManager,
    onAppSettings,
    onToggleTopBar,
    onJumpToColumn,
    disabled,
  ]);

  useEffect(() => {
    if (disabled) return;
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
  }, [
    onComposeTweet,
    onOpenLinkPopup,
    onAddColumn,
    onAccountManager,
    onAppSettings,
    onToggleTopBar,
    onJumpToColumn,
    disabled,
  ]);
}

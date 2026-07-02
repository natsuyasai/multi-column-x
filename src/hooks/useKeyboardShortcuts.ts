import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
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
  onReloadColumn?: () => void;
  onToggleHelp?: () => void;
  disabled?: boolean;
}

/** 入力中の要素（input / textarea / contentEditable）かどうかを判定する。
 * 修飾キー無しのショートカット（r / ?）はタイピングと衝突するためこのガードが必要。
 * Ctrl 併用の既存ショートカットは通常のテキスト入力と衝突しないため対象外とする。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts({
  onComposeTweet,
  onOpenLinkPopup = NOOP,
  onAddColumn = NOOP,
  onAccountManager = NOOP,
  onAppSettings = NOOP,
  onToggleTopBar = NOOP,
  onJumpToColumn = NOOP_INDEX,
  onReloadColumn = NOOP,
  onToggleHelp = NOOP,
  disabled = false,
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) {
        if (isEditableTarget(e.target)) return;
        if (e.key.toLowerCase() === "r") {
          onReloadColumn();
          return;
        }
        if (e.key === "?") {
          onToggleHelp();
          return;
        }
        return;
      }
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
      if (key === "a" && e.shiftKey) {
        onAccountManager();
        return;
      }
      if (key === ",") {
        onAppSettings();
        return;
      }
      if (key === "b") {
        onToggleTopBar();
        return;
      }
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        onJumpToColumn(digit - 1);
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
    onReloadColumn,
    onToggleHelp,
    disabled,
  ]);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    const unlisten = listen<string>(
      IPC_EVENTS.WEBVIEW_KEYBOARD_SHORTCUT,
      (e) => {
        if (!active) return;
        if (e.payload.startsWith("jump_column_")) {
          const digit = parseInt(e.payload.slice("jump_column_".length), 10);
          if (digit >= 1 && digit <= 9) {
            onJumpToColumn(digit - 1);
          }
          return;
        }
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
          case "account_manager":
            onAccountManager();
            break;
          case "app_settings":
            onAppSettings();
            break;
          case "toggle_top_bar":
            onToggleTopBar();
            break;
          case "reload_column":
            onReloadColumn();
            break;
          case "show_shortcut_help":
            onToggleHelp();
            break;
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
    onReloadColumn,
    onToggleHelp,
    disabled,
  ]);
}

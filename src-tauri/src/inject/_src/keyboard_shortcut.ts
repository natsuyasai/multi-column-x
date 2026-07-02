// src-tauri/src/inject/_src/keyboard_shortcut.ts
// コマンド名定数の一覧は constants.ts を参照
const REPORT_KEYBOARD_SHORTCUT = "report_keyboard_shortcut";

// 修飾キー無しのショートカット（r / ?）はタイピングと衝突するため、
// input / textarea / contentEditable にフォーカス中は発火させない。
// Ctrl 併用の既存ショートカットは通常のテキスト入力と衝突しないため対象外とする。
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

(function () {
  window.addEventListener(
    "keydown",
    function (e: KeyboardEvent) {
      let shortcutKey: string | null = null;
      if (e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === "t") shortcutKey = "compose_tweet";
        else if (key === "l") shortcutKey = "open_link_popup";
        else if (key === "n") shortcutKey = "add_column";
        else if (key === "a" && e.shiftKey) shortcutKey = "account_manager";
        else if (key === ",") shortcutKey = "app_settings";
        else if (key === "b") shortcutKey = "toggle_top_bar";
        else if (key >= "1" && key <= "9") shortcutKey = "jump_column_" + key;
      } else if (!isEditableTarget(e.target)) {
        const key = e.key.toLowerCase();
        if (key === "r") shortcutKey = "reload_column";
        else if (e.key === "?") shortcutKey = "show_shortcut_help";
      }
      if (!shortcutKey) return;
      e.preventDefault();
      const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
      if (invoke) {
        invoke(REPORT_KEYBOARD_SHORTCUT, { key: shortcutKey }).catch(
          function () {},
        );
      }
    },
    true,
  );
})();

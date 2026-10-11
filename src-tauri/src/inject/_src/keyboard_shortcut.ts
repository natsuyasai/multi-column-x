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

// Ctrl 併用のショートカット。キーは e.key.toLowerCase() で判定する。
// Ctrl+Shift+A と Ctrl+1〜9 は表に入らない特別扱いのため resolveShortcutKey 内に残す。
const CTRL_SHORTCUTS: Record<string, string> = {
  t: "compose_tweet",
  l: "open_link_popup",
  n: "add_column",
  ",": "app_settings",
  b: "toggle_top_bar",
};

// 修飾キー無しのショートカット。
// r は Shift+r（"R"）でも発火させるため小文字化して判定するが、
// ? は小文字化しても値が変わらないため、同じ e.key.toLowerCase() のキーで
// 両方を引ける（r の大文字小文字を区別しない・? はそのまま、という現状の違いを保つ）。
const PLAIN_SHORTCUTS: Record<string, string> = {
  r: "reload_column",
  "?": "show_shortcut_help",
};

function resolveShortcutKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey) {
    const key = e.key.toLowerCase();
    if (key === "a" && e.shiftKey) return "account_manager";
    if (key >= "1" && key <= "9") return "jump_column_" + key;
    return CTRL_SHORTCUTS[key] ?? null;
  }
  if (isEditableTarget(e.target)) return null;
  return PLAIN_SHORTCUTS[e.key.toLowerCase()] ?? null;
}

(function () {
  window.addEventListener(
    "keydown",
    function (e: KeyboardEvent) {
      const shortcutKey = resolveShortcutKey(e);
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

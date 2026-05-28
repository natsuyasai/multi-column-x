const REPORT_KEYBOARD_SHORTCUT = "report_keyboard_shortcut";
(function () {
  window.addEventListener(
    "keydown",
    function (e) {
      if (!e.ctrlKey) return;
      var key = e.key.toLowerCase();
      var shortcutKey = null;
      if (key === "t") shortcutKey = "compose_tweet";
      else if (key === "l") shortcutKey = "open_link_popup";
      else if (key === "n") shortcutKey = "add_column";
      else if (key === "a" && e.shiftKey) shortcutKey = "account_manager";
      else if (key === ",") shortcutKey = "app_settings";
      else if (key === "b") shortcutKey = "toggle_top_bar";
      if (!shortcutKey) return;
      e.preventDefault();
      var invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
      if (invoke) {
        invoke(REPORT_KEYBOARD_SHORTCUT, { key: shortcutKey }).catch(
          function () {},
        );
      }
    },
    true,
  );
})();

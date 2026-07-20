// src-tauri/src/inject/_src/notification_header_hide.ts
(function () {
  const STYLE_ID = "multi-column-x-notification-header-hide";

  function inject(): void {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `div:has(a[data-testid="settingsAppBar"][href="/settings/notifications"]):not(:has(nav[aria-label="通知タイムライン"])) { display: none !important; }`;
    document.head.appendChild(style);
  }

  if (document.head) {
    inject();
  } else {
    document.addEventListener("DOMContentLoaded", inject);
  }
})();

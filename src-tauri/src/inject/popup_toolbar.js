(function() {
  const accounts = window.__tvAccounts ?? [];
  const currentAccountId = window.__tvCurrentAccountId ?? "";
  if (document.getElementById("tv-popup-toolbar")) return;
  if (accounts.length === 0) return;
  function tauriInvoke(cmd, args) {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args).catch(function(err) {
        console.error("[popup_toolbar]", err);
      });
    }
  }
  const TOOLBAR_HEIGHT = 40;
  const toolbar = document.createElement("div");
  toolbar.id = "tv-popup-toolbar";
  toolbar.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "width: 100%",
    "height: " + TOOLBAR_HEIGHT + "px",
    "z-index: 99999",
    "background: #15202b",
    "border-bottom: 1px solid #38444d",
    "display: flex",
    "align-items: center",
    "padding: 0 12px",
    "box-sizing: border-box",
    "font-family: sans-serif",
    "font-size: 13px",
    "color: #e7e9ea"
  ].join(";");
  const label = document.createElement("span");
  label.textContent = "アカウント: ";
  label.style.cssText = "margin-right: 8px; white-space: nowrap;";
  const select = document.createElement("select");
  select.style.cssText = [
    "background: #253341",
    "color: #e7e9ea",
    "border: 1px solid #38444d",
    "border-radius: 4px",
    "padding: 4px 8px",
    "font-size: 13px",
    "cursor: pointer",
    "max-width: 200px"
  ].join(";");
  accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.label;
    if (account.id === currentAccountId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  select.addEventListener("change", function() {
    const selectedId = select.value;
    const selectedAccount = accounts.find((a) => a.id === selectedId);
    if (!selectedAccount) return;
    const popupLabel = window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "";
    tauriInvoke("switch_popup_session", {
      popupLabel,
      accountId: selectedAccount.id,
      dataDirectory: selectedAccount.dataDirectory,
      url: window.location.href
    });
  });
  toolbar.appendChild(label);
  toolbar.appendChild(select);
  function inject() {
    if (document.body) {
      document.body.style.paddingTop = TOOLBAR_HEIGHT + "px";
      document.body.insertBefore(toolbar, document.body.firstChild);
    } else {
      document.addEventListener("DOMContentLoaded", function() {
        document.body.style.paddingTop = TOOLBAR_HEIGHT + "px";
        document.body.insertBefore(toolbar, document.body.firstChild);
      });
    }
  }
  inject();
})();

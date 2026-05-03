// src-tauri/src/inject/_src/popup_toolbar.ts
(function () {
  const accounts: TvAccountInfo[] = window.__tvAccounts ?? [];
  const currentAccountId: string = window.__tvCurrentAccountId ?? "";

  if (document.getElementById("tv-popup-toolbar")) return;

  if (accounts.length === 0) return;

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke =
      window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args).catch(function (err: unknown) {
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
    "color: #e7e9ea",
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
    "max-width: 200px",
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

  select.addEventListener("change", function () {
    const selectedId = select.value;
    const selectedAccount = accounts.find((a) => a.id === selectedId);
    if (!selectedAccount) return;
    const popupLabel =
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "";
    tauriInvoke("switch_popup_session", {
      popupLabel,
      accountId: selectedAccount.id,
      dataDirectory: selectedAccount.dataDirectory,
      url: window.location.href,
    });
  });

  toolbar.appendChild(label);
  toolbar.appendChild(select);

  function applyOffset() {
    // x.com は body.paddingTop を無視する独自スクロールコンテナを使うため、
    // react-root に直接 margin-top を当てる
    const root = document.getElementById("react-root");
    if (root) {
      (root as HTMLElement).style.marginTop = TOOLBAR_HEIGHT + "px";
      (root as HTMLElement).style.height = `calc(100vh - ${TOOLBAR_HEIGHT}px)`;
    }
  }

  function inject() {
    const doInject = () => {
      document.body.insertBefore(toolbar, document.body.firstChild);
      applyOffset();

      // react-root が後から mount される場合に備えて MutationObserver で追従
      const observer = new MutationObserver(() => {
        applyOffset();
      });
      observer.observe(document.body, { childList: true, subtree: false });
    };

    if (document.body) {
      doInject();
    } else {
      document.addEventListener("DOMContentLoaded", doInject);
    }
  }

  inject();
})();

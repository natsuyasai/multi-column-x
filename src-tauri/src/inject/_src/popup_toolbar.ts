// src-tauri/src/inject/_src/popup_toolbar.ts
// コマンド名定数の一覧は constants.ts を参照
const SWITCH_POPUP_SESSION = "switch_popup_session";
const CLOSE_POPUP_WINDOW = "close_popup_window";

(function () {
  const accounts: TvAccountInfo[] = window.__mcxAccounts ?? [];
  const currentAccountId: string = window.__mcxCurrentAccountId ?? "";
  const targetHref: string = window.__mcxTargetHref ?? "";
  const escCloseEnabled: boolean = window.__mcxEscCloseEnabled ?? true;

  if (document.getElementById("tv-popup-toolbar")) return;

  if (accounts.length === 0) return;

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
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
    "bottom: 0",
    "left: 0",
    "width: 100%",
    "height: " + TOOLBAR_HEIGHT + "px",
    "z-index: 99999",
    "background: #15202b",
    "border-top: 1px solid #38444d",
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
    // Android のネイティブ WebView には Tauri IPC が無いため、
    // addJavascriptInterface で公開されたブリッジを優先して使う。
    const androidBridge = window.__mcxPopupBridge;
    if (androidBridge) {
      androidBridge.switchPopupSession(
        selectedAccount.id,
        window.location.href,
      );
      return;
    }
    const popupLabel =
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "";
    tauriInvoke(SWITCH_POPUP_SESSION, {
      popupLabel,
      accountId: selectedAccount.id,
      dataDirectory: selectedAccount.dataDirectory,
      url: window.location.href,
    });
  });

  toolbar.appendChild(label);
  toolbar.appendChild(select);

  function inject() {
    const doInject = () => {
      document.body.appendChild(toolbar);
    };

    if (document.body) {
      doInject();
    } else {
      document.addEventListener("DOMContentLoaded", doInject);
    }
  }

  inject();

  if (escCloseEnabled) {
    document.addEventListener("keydown", function (e: KeyboardEvent) {
      if (e.key === "Escape") {
        tauriInvoke(CLOSE_POPUP_WINDOW, {
          label:
            window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "",
        });
      }
    });
  }

  // targetHref と一致する <a> をページロード後に自動クリックする
  if (!targetHref) return;

  function normalizeHref(href: string): string {
    try {
      const u = new URL(href, "https://x.com");
      return u.pathname + u.search;
    } catch {
      return href;
    }
  }

  function tryClick(root: Document): boolean {
    const targetPath = normalizeHref(targetHref);
    const links = root.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const link of links) {
      if (normalizeHref(link.getAttribute("href") ?? "") === targetPath) {
        link.click();
        return true;
      }
    }
    return false;
  }

  function watchAndClick(): void {
    if (tryClick(document)) return;
    const observer = new MutationObserver(() => {
      if (tryClick(document)) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchAndClick);
  } else {
    watchAndClick();
  }
})();

// src-tauri/src/inject/_src/mobile_tab_bar.ts
(function () {
  const TAB_BAR_HEIGHT = 56;
  const BAR_ID = "__mobile_tab_bar__";
  const STATUS_OVERLAY_ID = "__status_bar_overlay__";

  // Rust 側の init_script から注入されるシステムバーの高さ（dp）
  const TOP_INSET: number = window.__mobileTopInset ?? 0;
  const BOTTOM_INSET: number = window.__mobileBottomInset ?? 0;

  // WebView がメイン Activity の子 View として安全領域内に配置されているか検出する。
  // decorView.setPadding() が適用された場合、window.innerHeight は安全領域の高さになるため
  // screen.height との差が TOP_INSET + BOTTOM_INSET 程度になる。
  // 差が小さい（≈0）場合はエッジツーエッジ（フルスクリーン）モード。
  const _screenH: number = window.screen?.height ?? 0;
  const _insetSum: number = TOP_INSET + BOTTOM_INSET;
  const IS_SAFE_AREA: boolean =
    _screenH > 0 &&
    _screenH - window.innerHeight >= _insetSum - 15 &&
    _insetSum > 0;
  // 安全領域モード: システムバーはネイティブ側が処理済みのためCSSオーバーレイ不要
  // エッジツーエッジモード: CSSでシステムバー領域をカバーする必要あり
  const EFFECTIVE_TOP_INSET: number = IS_SAFE_AREA ? 0 : TOP_INSET;
  const EFFECTIVE_BOTTOM_INSET: number = IS_SAFE_AREA ? 0 : BOTTOM_INSET;

  function tauriInvoke(cmd: string, args?: Record<string, unknown>): void {
    const invoke =
      (window.__TAURI__ &&
        ((window.__TAURI__.core && window.__TAURI__.core.invoke) ||
          window.__TAURI__.invoke)) ||
      null;
    if (invoke) invoke(cmd, args);
  }

  function escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ステータスバー領域（上部）を隠す黒いオーバーレイ。
  // WebView がフルスクリーン Activity の場合、コンテンツがステータスバーと重なるため必要。
  function createOrUpdateStatusOverlay(): void {
    if (EFFECTIVE_TOP_INSET <= 0 || !document.body) return;
    let overlayEl = document.getElementById(STATUS_OVERLAY_ID);
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = STATUS_OVERLAY_ID;
      document.body.appendChild(overlayEl);
    }
    const overlay = overlayEl;
    overlay.style.cssText =
      "position:fixed!important;top:0!important;left:0!important;" +
      "width:100vw!important;height:" +
      EFFECTIVE_TOP_INSET +
      "px!important;" +
      "background:#000000!important;" +
      "z-index:2147483646!important;" +
      "pointer-events:none!important;";
  }

  function createOrUpdateTabBar(): void {
    if (!document.body) return;

    const tabs = (window.__mobileTabs ?? [])
      .slice()
      .sort((a, b) => a.order - b.order);
    const activeId: string = window.__mobileActiveColumnId ?? "";

    let barEl = document.getElementById(BAR_ID);
    if (!barEl) {
      barEl = document.createElement("div");
      barEl.id = BAR_ID;
      document.body.appendChild(barEl);
    }
    const bar = barEl;

    bar.style.cssText =
      "position:fixed!important;bottom:" +
      EFFECTIVE_BOTTOM_INSET +
      "px!important;left:0!important;" +
      "width:100vw!important;max-width:100vw!important;" +
      "height:" +
      TAB_BAR_HEIGHT +
      "px!important;background:#1c1c1e!important;" +
      "border-top:1px solid rgba(255,255,255,0.12)!important;" +
      "display:flex!important;align-items:stretch!important;" +
      "z-index:2147483647!important;box-sizing:border-box!important;overflow:hidden!important;";

    const tabsHtml = tabs
      .map((col) => {
        const isActive = col.id === activeId;
        const label = escapeHtml(col.label || col.id);
        return (
          '<div class="__mob_tab__" data-col-id="' +
          col.id +
          '" style="' +
          "flex:0 0 auto;display:flex;align-items:center;padding:0 10px;cursor:pointer;" +
          "white-space:nowrap;font-size:13px;min-width:72px;max-width:130px;overflow:hidden;" +
          "text-overflow:ellipsis;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
          "color:" +
          (isActive ? "#fff" : "rgba(255,255,255,0.55)") +
          ";" +
          "background:" +
          (isActive ? "rgba(255,255,255,0.08)" : "transparent") +
          ";" +
          '">' +
          '<span style="overflow:hidden;text-overflow:ellipsis;flex:1;">' +
          label +
          "</span>" +
          '<button class="__mob_settings_btn__" data-col-id="' +
          col.id +
          '" style="' +
          "background:none;border:none;color:inherit;cursor:pointer;padding:2px 4px;" +
          "font-size:13px;opacity:0.5;flex-shrink:0;margin-left:4px;" +
          '">⚙</button>' +
          "</div>"
        );
      })
      .join("");

    bar.innerHTML =
      '<div id="__mob_tabs_scroll__" style="flex:1;display:flex;overflow-x:auto;overflow-y:hidden;' +
      '-webkit-overflow-scrolling:touch;">' +
      tabsHtml +
      "</div>" +
      '<div style="flex-shrink:0;display:flex;align-items:center;border-left:1px solid rgba(255,255,255,0.12);">' +
      '<button id="__mob_acct_btn__" style="height:100%;padding:0 14px;background:none;border:none;' +
      'color:rgba(255,255,255,0.7);cursor:pointer;font-size:16px;display:flex;align-items:center;">👤</button>' +
      '<button id="__mob_add_btn__" style="height:100%;padding:0 14px;background:none;border:none;' +
      'color:rgba(255,255,255,0.7);cursor:pointer;font-size:20px;display:flex;align-items:center;">＋</button>' +
      "</div>";

    bar.querySelector("#__mob_tabs_scroll__")!.addEventListener(
      "click",
      (e: Event) => {
        let el = e.target as HTMLElement | null;
        // Settings button inside a tab
        while (el && el !== bar) {
          if (el.classList.contains("__mob_settings_btn__")) {
            const colId = el.getAttribute("data-col-id");
            if (colId) {
              tauriInvoke("open_mobile_dialog", {
                dialog: "column_settings",
                columnId: colId,
              });
            }
            return;
          }
          el = el.parentElement;
        }
        // Tab itself
        el = e.target as HTMLElement | null;
        while (el && el !== bar) {
          if (
            el.getAttribute("data-col-id") &&
            el.classList.contains("__mob_tab__")
          ) {
            const id = el.getAttribute("data-col-id");
            if (id && id !== activeId) {
              tauriInvoke("switch_mobile_column", { columnId: id });
            }
            return;
          }
          el = el.parentElement;
        }
      },
    );

    bar.querySelector("#__mob_acct_btn__")!.addEventListener("click", () => {
      tauriInvoke("open_mobile_dialog", {
        dialog: "account_manager",
        columnId: null,
      });
    });

    bar.querySelector("#__mob_add_btn__")!.addEventListener("click", () => {
      tauriInvoke("open_mobile_dialog", { dialog: "add_column", columnId: null });
    });
  }

  window.__mobileUpdateTabBar = function (
    tabs: MobileTab[],
    activeId: string,
  ): void {
    window.__mobileTabs = tabs;
    window.__mobileActiveColumnId = activeId;
    createOrUpdateTabBar();
  };

  function init(): void {
    createOrUpdateStatusOverlay();
    createOrUpdateTabBar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-inject if SPA removes our elements (X.com is a SPA)
  const reinsertObserver = new MutationObserver(() => {
    if (!document.body) return;
    if (!document.getElementById(BAR_ID)) createOrUpdateTabBar();
    if (EFFECTIVE_TOP_INSET > 0 && !document.getElementById(STATUS_OVERLAY_ID))
      createOrUpdateStatusOverlay();
  });

  function startObserver(): void {
    if (document.body) {
      reinsertObserver.observe(document.body, { childList: true });
    }
  }

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver);
  }
})();

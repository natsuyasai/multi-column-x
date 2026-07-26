// src-tauri/src/inject/_src/header_customizer.ts
/// <reference path="./types.d.ts" />
import React from "react";
import { createRoot } from "react-dom/client";
import { HeaderCustomizer } from "./HeaderCustomizer";

(function () {
  let root: ReturnType<typeof createRoot> | null = null;

  function mount() {
    if (!document.body) {
      setTimeout(mount, 50);
      return;
    }
    if (document.getElementById("multi-column-x-header-customizer-root"))
      return;
    const container = document.createElement("div");
    container.id = "multi-column-x-header-customizer-root";
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(React.createElement(HeaderCustomizer));
  }

  function unmount() {
    if (root) {
      root.unmount();
      root = null;
    }
    document.getElementById("multi-column-x-header-customizer-root")?.remove();
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.applyAreaVisibility = function (
    hideHeaderEnabled: boolean,
    hideTweetInputEnabled: boolean,
  ) {
    // useHeaderCustomizer.ts の CSS 適用 useEffect は空配列依存のためマウント時に
    // 一度しか実行されない。既にマウント済みの状態で設定値だけ変わった場合でも
    // 新しい設定を反映させるため、常に一度アンマウントしてから必要なら再マウントする。
    unmount();
    if (hideHeaderEnabled || hideTweetInputEnabled) {
      mount();
    }
  };

  const config = window.__multiColumnXConfig;
  const shouldMount = Boolean(
    config?.hideHeaderEnabled || config?.hideTweetInputEnabled,
  );

  if (shouldMount) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      mount();
    }
  }
})();

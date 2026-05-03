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
    if (document.getElementById("twitter-viewer-header-customizer-root"))
      return;
    const container = document.createElement("div");
    container.id = "twitter-viewer-header-customizer-root";
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(React.createElement(HeaderCustomizer));
  }

  function unmount() {
    if (root) {
      root.unmount();
      root = null;
    }
    document.getElementById("twitter-viewer-header-customizer-root")?.remove();
  }

  window.__twitterViewer =
    window.__twitterViewer || ({} as Window["__twitterViewer"]);
  window.__twitterViewer.applyAreaRemove = function (enabled: boolean) {
    if (enabled && (window.__twitterViewerConfig?.showCustomMenu ?? true)) {
      mount();
    } else {
      unmount();
    }
  };

  const shouldMount =
    window.__twitterViewerConfig?.areaRemoveEnabled &&
    (window.__twitterViewerConfig?.showCustomMenu ?? true);

  if (shouldMount) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      mount();
    }
  }
})();

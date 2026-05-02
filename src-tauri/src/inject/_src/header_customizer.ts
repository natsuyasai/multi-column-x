// src-tauri/src/inject/_src/header_customizer.ts
import React from "react";
import { createRoot } from "react-dom/client";
import { HeaderCustomizer } from "./HeaderCustomizer";

(function () {
  function mount() {
    const container = document.createElement("div");
    container.id = "twitter-viewer-header-customizer-root";
    document.body.appendChild(container);
    createRoot(container).render(React.createElement(HeaderCustomizer));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

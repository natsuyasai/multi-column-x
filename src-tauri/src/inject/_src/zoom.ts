(function () {
  const zoom = window.__multiColumnXConfig?.zoomLevel ?? 1;
  if (document.documentElement) {
    document.documentElement.style.zoom = String(zoom);
  }
})();

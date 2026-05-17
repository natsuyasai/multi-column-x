(function () {
  const zoom = window.__multiColumnXConfig?.zoomLevel ?? 1;
  if (zoom === 1) return;
  if (document.documentElement) {
    document.documentElement.style.zoom = String(zoom);
  }
})();

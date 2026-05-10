(function () {
  const zoom = window.__multiColumnXConfig?.zoomLevel ?? 1;
  document.documentElement.style.zoom = String(zoom);
})();

// src-tauri/src/inject/auto_reload.js
(function() {
  var timerId = null;
  var isEnabled = true;
  var intervalSec = 60;
  var isScrolling = false;
  var scrollTimer = null;

  document.addEventListener('scroll', function() {
    isScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() { isScrolling = false; }, 1000);
  }, true);

  function startAutoReload(intervalSeconds) {
    stopAutoReload();
    intervalSec = intervalSeconds || intervalSec;
    isEnabled = true;
    timerId = setInterval(function() {
      if (!isScrolling && isEnabled) {
        window.location.reload();
      }
    }, intervalSec * 1000);
  }

  function stopAutoReload() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    isEnabled = false;
  }

  function setAutoReloadEnabled(enabled, intervalSeconds) {
    if (enabled) {
      startAutoReload(intervalSeconds);
    } else {
      stopAutoReload();
    }
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.setAutoReloadEnabled = setAutoReloadEnabled;
  window.__twitterViewer.startAutoReload = startAutoReload;
  window.__twitterViewer.stopAutoReload = stopAutoReload;
})();

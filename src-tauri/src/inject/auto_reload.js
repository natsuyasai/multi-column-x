// src-tauri/src/inject/auto_reload.js
(function() {
  function isScrolling() {
    return document.scrollingElement
      ? document.scrollingElement.scrollTop > 0
      : false;
  }

  function isFollowingTabActive() {
    var tabs = document.querySelectorAll("div[role='tab']");
    for (var i = 0; i < tabs.length; i++) {
      var elem = tabs[i];
      if (elem.getAttribute("aria-selected") === "true" && elem.hasAttribute("aria-expanded")) {
        return true;
      }
    }
    return false;
  }

  function findNewPostsButton() {
    var section = document.querySelector("section[aria-labelledby]");
    if (!section) return null;
    var cells = section.querySelectorAll('[data-testid="cellInnerDiv"]');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].querySelector("article")) continue;
      var btn = cells[i].querySelector('button[type="button"]');
      if (btn) return btn;
    }
    return null;
  }

  function waitAndClickNewPostsButton() {
    var btn = findNewPostsButton();
    if (btn) { btn.click(); return; }
    var section = document.querySelector("section[aria-labelledby]");
    if (!section) return;
    var observer = new MutationObserver(function() {
      var found = findNewPostsButton();
      if (found) { observer.disconnect(); found.click(); }
    });
    observer.observe(section, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); }, 30000);
  }

  function triggerFollowingRefresh() {
    window.dispatchEvent(new Event("focus"));
    waitAndClickNewPostsButton();
  }

  function reselectTab() {
    var tabs = document.querySelectorAll("div[role='tab']");
    for (var i = 0; i < tabs.length; i++) {
      var elem = tabs[i];
      if (elem.getAttribute("aria-selected") === "true") {
        // フォロー中タブはスキップ（専用処理で更新）
        if (!elem.hasAttribute("aria-expanded")) {
          elem.click();
        }
        break;
      }
    }
  }

  // Shell 側（React）からカウントダウン完了時に呼び出されるエントリポイント
  function triggerReload() {
    if (isScrolling()) return;
    if (isFollowingTabActive()) {
      triggerFollowingRefresh();
    } else {
      reselectTab();
    }
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.triggerReload = triggerReload;
})();

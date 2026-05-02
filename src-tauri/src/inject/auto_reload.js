(function() {
  function isScrolling() {
    return document.scrollingElement ? document.scrollingElement.scrollTop > 0 : false;
  }
  function isFollowingTabActive() {
    const tabs = document.querySelectorAll("div[role='tab']");
    for (const elem of tabs) {
      if (elem.getAttribute("aria-selected") === "true" && elem.hasAttribute("aria-expanded")) {
        return true;
      }
    }
    return false;
  }
  function findNewPostsButton() {
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return null;
    const cells = section.querySelectorAll('[data-testid="cellInnerDiv"]');
    for (const cell of cells) {
      if (cell.querySelector("article")) continue;
      const btn = cell.querySelector('button[type="button"]');
      if (btn) return btn;
    }
    return null;
  }
  function waitAndClickNewPostsButton() {
    const btn = findNewPostsButton();
    if (btn) {
      btn.click();
      return;
    }
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;
    const observer = new MutationObserver(function() {
      const found = findNewPostsButton();
      if (found) {
        observer.disconnect();
        found.click();
      }
    });
    observer.observe(section, { childList: true, subtree: true });
    setTimeout(function() {
      observer.disconnect();
    }, 3e4);
  }
  function triggerFollowingRefresh() {
    window.dispatchEvent(new Event("focus"));
    waitAndClickNewPostsButton();
  }
  function reselectTab() {
    const tabs = document.querySelectorAll("div[role='tab']");
    for (const elem of tabs) {
      if (elem.getAttribute("aria-selected") === "true") {
        if (!elem.hasAttribute("aria-expanded")) {
          elem.click();
        }
        break;
      }
    }
  }
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

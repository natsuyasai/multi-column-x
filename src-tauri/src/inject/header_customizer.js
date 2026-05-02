// src-tauri/src/inject/header_customizer.js
// 参照: twitter-utils/src/content-scripts/header-customizer/
(function() {
  var HEADER_HIDE_STYLE_ID = 'twitter-viewer-header-hide';
  var INPUT_HIDE_STYLE_ID  = 'twitter-viewer-input-hide';
  var NAV_CONTAINER_ID     = 'twitter-viewer-nav-container';
  var NAV_VISIBLE_KEY      = 'twitter-viewer-nav-visible';

  // __twitterViewerConfig が存在しない場合は true をデフォルトとする
  var currentEnabled = !(
    window.__twitterViewerConfig &&
    window.__twitterViewerConfig.areaRemoveEnabled === false
  );

  // ---- SVG フォールバック定義 ----
  var COMPOSE_ICON_PATH =
    'M23 3c-6.62-.1-10.38 2.421-13.05 6.03C7.29 12.61 6 17.331 6 22h2c0-1.007.07-2.012.19-3H12c4.1 0 7.48-3.082 7.94-7.054C22.79 10.147 23.17 6.359 23 3zm-7 8h-1.5v2H16c.63-.016 1.2-.08 1.72-.188C16.95 15.24 14.68 17 12 17H8.55c.57-2.512 1.57-4.851 3-6.78 2.16-2.912 5.29-4.911 9.45-5.187C20.95 8.079 19.9 11 16 11zM4 9V6H1V4h3V1h2v3h3v2H6v3H4z';
  var CLOSE_ICON_PATH =
    'M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z';

  var DEFAULT_NAV_LINKS = [
    { href: '/home',                ariaLabel: 'ホーム',               svgContent: '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h6.638c.511 0 .929-.41.929-.913v-7.075h3.008v7.075c0 .502.418.913.929.913h6.639c.51 0 .928-.41.928-.913V7.904c0-.301-.158-.584-.408-.758zM20 20l-4.5.01.011-7.097c0-.502-.418-.913-.928-.913H9.44c-.511 0-.929.41-.929.913L8.5 20H4V8.773l8.011-5.342L20 8.764z"></path></g></svg>' },
    { href: '/notifications',       ariaLabel: '通知',                 svgContent: '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.864 16H5.134z"></path></g></svg>' },
    { href: '/messages',            ariaLabel: 'ダイレクトメッセージ', svgContent: '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.636V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 3.636-8-3.638V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z"></path></g></svg>' },
    { href: '/i/bookmarks',         ariaLabel: 'ブックマーク',         svgContent: '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g></svg>' },
    { href: '/compose/post',        ariaLabel: 'ポストする',           svgContent: '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="' + COMPOSE_ICON_PATH + '"></path></g></svg>' },
  ];

  // ---- スタイル管理 ----
  function setStyle(id, css, enabled) {
    var el = document.getElementById(id);
    if (enabled) {
      if (!el) {
        var s = document.createElement('style');
        s.id = id;
        s.textContent = css;
        // document.head がまだなければ documentElement に追加
        (document.head || document.documentElement).appendChild(s);
      }
    } else {
      if (el) el.remove();
    }
  }

  function applyHideStyles(enabled) {
    setStyle(HEADER_HIDE_STYLE_ID,
      "header[role='banner'] { display: none !important; }",
      enabled);
    setStyle(INPUT_HIDE_STYLE_ID,
      "div:has(> [role='progressbar'] + * div[data-testid*='tweetTextarea']) { display: none !important; }",
      enabled);
  }

  // ヘッダー非表示スタイルを head が使えるようになるまで監視して確実に適用する
  function ensureHideStylesApplied() {
    if (!currentEnabled) return;
    // すでに適用済みなら終了
    if (document.getElementById(HEADER_HIDE_STYLE_ID)) return;

    // head がある → 即適用
    if (document.head) {
      applyHideStyles(true);
      return;
    }

    // head がまだない → documentElement に挿入し、head が来たら移し直す
    applyHideStyles(true); // documentElement に入る
    var headObserver = new MutationObserver(function() {
      if (document.head) {
        headObserver.disconnect();
        // documentElement に入ったスタイルを head に移す
        var el1 = document.getElementById(HEADER_HIDE_STYLE_ID);
        var el2 = document.getElementById(INPUT_HIDE_STYLE_ID);
        if (el1) document.head.appendChild(el1);
        if (el2) document.head.appendChild(el2);
      }
    });
    headObserver.observe(document.documentElement, { childList: true });
  }

  // ---- ナビバー DOM ----
  function buildNavContainer(links, isVisible) {
    var container = document.createElement('div');
    container.id = NAV_CONTAINER_ID;
    container.setAttribute('data-twitter-viewer', '1');
    applyContainerStyles(container);

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('data-tv-toggle', '1');
    toggleBtn.title = isVisible ? 'ナビゲーションを非表示' : 'ナビゲーションを表示';
    applyToggleStyles(toggleBtn);
    toggleBtn.innerHTML = isVisible ? '&times;' : '&#9776;';

    var navBar = document.createElement('div');
    navBar.setAttribute('data-tv-navbar', '1');
    applyNavBarStyles(navBar, isVisible);

    links.forEach(function(link) {
      var a = document.createElement('a');
      a.href = link.href;
      a.setAttribute('aria-label', link.ariaLabel);
      a.setAttribute('data-tv-navlink', '1');
      applyNavLinkStyles(a, link.href === '/compose/post');
      a.innerHTML = link.svgContent;
      navBar.appendChild(a);
    });

    toggleBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var visible = navBar.getAttribute('data-visible') === '1';
      setNavVisible(!visible);
    });

    container.appendChild(toggleBtn);
    container.appendChild(navBar);
    return container;
  }

  function setNavVisible(visible) {
    var container = document.getElementById(NAV_CONTAINER_ID);
    if (!container) return;
    var toggleBtn = container.querySelector('[data-tv-toggle]');
    var navBar    = container.querySelector('[data-tv-navbar]');
    navBar.setAttribute('data-visible', visible ? '1' : '0');
    applyNavBarStyles(navBar, visible);
    toggleBtn.innerHTML = visible ? '&times;' : '&#9776;';
    toggleBtn.title = visible ? 'ナビゲーションを非表示' : 'ナビゲーションを表示';
    try { localStorage.setItem(NAV_VISIBLE_KEY, String(visible)); } catch(e) {}
  }

  // ---- ポスト欄トグル ----
  function toggleTweetInput() {
    var el = document.getElementById(INPUT_HIDE_STYLE_ID);
    var container = document.getElementById(NAV_CONTAINER_ID);
    var composeLink = container ? container.querySelector('a[href="/compose/post"]') : null;
    if (el) {
      // 現在非表示 → 表示
      el.remove();
      if (composeLink) {
        composeLink.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="' + CLOSE_ICON_PATH + '"></path></g></svg>';
        composeLink.setAttribute('aria-label', '閉じる');
      }
    } else {
      // 現在表示 → 非表示
      setStyle(INPUT_HIDE_STYLE_ID,
        "div:has(> [role='progressbar'] + * div[data-testid*='tweetTextarea']) { display: none !important; }",
        true);
      if (composeLink) {
        composeLink.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="' + COMPOSE_ICON_PATH + '"></path></g></svg>';
        composeLink.setAttribute('aria-label', 'ポストする');
      }
    }
  }

  // ---- ナビリンクのクリックハンドラ ----
  // compose/post だけトグル、それ以外は x.com 内遷移（デフォルト動作）
  document.addEventListener('click', function(e) {
    var link = e.target && e.target.closest ? e.target.closest('[data-tv-navlink]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (href === '/compose/post') {
      e.preventDefault();
      e.stopPropagation();
      toggleTweetInput();
    }
    // それ以外はブラウザのデフォルト遷移に任せる（x.com 内ページ遷移）
  }, true);

  // ---- ヘッダーから実際のリンクを抽出してナビバーに反映 ----
  function extractLinksFromHeader() {
    var header = document.querySelector("header[role='banner']");
    if (!header) return false;
    var anchors = header.querySelectorAll('a[role="link"]');
    if (!anchors.length) return false;

    var links = [];
    anchors.forEach(function(a) {
      var href      = a.getAttribute('href');
      var ariaLabel = a.getAttribute('aria-label');
      var svg       = a.querySelector('svg');
      if (!href || !ariaLabel || ariaLabel === 'X' || !svg) return;
      links.push({ href: href, ariaLabel: ariaLabel, svgContent: svg.outerHTML });
    });
    // compose/post がなければ追加
    var hasCompose = links.some(function(l) { return l.href === '/compose/post'; });
    if (!hasCompose) {
      links.push(DEFAULT_NAV_LINKS[DEFAULT_NAV_LINKS.length - 1]);
    }
    return links.length ? links : false;
  }

  // ---- ナビバーを構築して body に挿入 ----
  function mountNavBar(links) {
    if (document.getElementById(NAV_CONTAINER_ID)) return; // 重複防止
    var isVisible;
    try {
      var stored = localStorage.getItem(NAV_VISIBLE_KEY);
      isVisible = stored === null ? false : stored === 'true';
    } catch(e) { isVisible = false; }

    var container = buildNavContainer(links, isVisible);
    document.body.appendChild(container);
  }

  // ---- retry + MutationObserver でヘッダーを待つ ----
  function waitAndMount() {
    var retryCount = 0;
    var maxRetries = 10;
    var retryTimer = null;
    var observer   = null;
    var timeoutTimer = null;

    function tryMount() {
      var links = extractLinksFromHeader();
      if (links) {
        if (retryTimer)   clearInterval(retryTimer);
        if (observer)     observer.disconnect();
        if (timeoutTimer) clearTimeout(timeoutTimer);
        mountNavBar(links);
        return true;
      }
      return false;
    }

    setTimeout(function() {
      if (tryMount()) return;

      retryTimer = setInterval(function() {
        retryCount++;
        if (tryMount()) return;
        if (retryCount >= maxRetries) {
          clearInterval(retryTimer);
          observer = new MutationObserver(function() {
            if (tryMount()) observer.disconnect();
          });
          observer.observe(document.body || document.documentElement,
            { childList: true, subtree: true });
        }
      }, 200);

      // 5秒でタイムアウト → フォールバックリンクで表示
      timeoutTimer = setTimeout(function() {
        if (retryTimer) clearInterval(retryTimer);
        if (observer)   observer.disconnect();
        if (!document.getElementById(NAV_CONTAINER_ID)) {
          mountNavBar(DEFAULT_NAV_LINKS);
        }
      }, 5000);
    }, 100);
  }

  // ---- インラインスタイル定義 ----
  function applyContainerStyles(el) {
    var s = el.style;
    s.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'width:100%',
      'z-index:2147483647', 'pointer-events:none',
      'display:flex', 'align-items:flex-end', 'padding:10px', 'gap:10px',
      'box-sizing:border-box',
    ].join(';');
  }

  function applyToggleStyles(el) {
    var s = el.style;
    s.cssText = [
      'pointer-events:auto', 'width:50px', 'height:50px', 'border-radius:50%',
      'background:rgba(29,155,240,0.9)', 'color:#fff', 'border:none',
      'cursor:pointer', 'font-size:24px', 'display:flex',
      'align-items:center', 'justify-content:center',
      'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
      'transition:background 0.2s', 'flex-shrink:0',
    ].join(';');
  }

  function applyNavBarStyles(el, visible) {
    var s = el.style;
    s.cssText = [
      'pointer-events:' + (visible ? 'auto' : 'none'),
      'background:rgba(0,0,0,0.85)',
      'backdrop-filter:blur(10px)',
      'border-radius:50px',
      'padding:10px 20px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
      'display:flex', 'flex-direction:row', 'align-items:center', 'gap:10px',
      'max-width:calc(100vw - 120px)',
      'overflow-x:auto', 'overflow-y:hidden',
      'opacity:' + (visible ? '1' : '0'),
      'transform:' + (visible ? 'scale(1)' : 'scale(0.8)'),
      'transition:opacity 0.3s,transform 0.3s',
    ].join(';');
    el.setAttribute('data-visible', visible ? '1' : '0');
  }

  function applyNavLinkStyles(el, isCompose) {
    var s = el.style;
    s.cssText = [
      'pointer-events:auto',
      'display:flex', 'align-items:center', 'justify-content:center',
      'width:40px', 'height:40px', 'border-radius:50%',
      'text-decoration:none', 'color:#fff', 'flex-shrink:0',
      'background:' + (isCompose ? 'rgb(239,243,244)' : 'transparent'),
      'transition:background 0.2s',
    ].join(';');
  }

  // ---- 公開 API ----
  function applyAreaRemove(enabled) {
    currentEnabled = enabled;
    if (enabled) {
      ensureHideStylesApplied();
      var container = document.getElementById(NAV_CONTAINER_ID);
      if (!container) waitAndMount();
    } else {
      applyHideStyles(false);
      var container = document.getElementById(NAV_CONTAINER_ID);
      if (container) container.remove();
    }
  }

  // ---- 初期化 ----
  // スタイル非表示はスクリプト実行直後から仕掛ける（DOMContentLoaded を待たない）
  if (currentEnabled) {
    ensureHideStylesApplied();
  }

  // ナビバー構築は body が必要なので DOMContentLoaded 後
  function initNavBar() {
    if (currentEnabled) waitAndMount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavBar);
  } else {
    initNavBar();
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.applyAreaRemove = applyAreaRemove;
})();

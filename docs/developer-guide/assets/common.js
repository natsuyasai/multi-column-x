/* MCX 開発者ガイド 共通スクリプト（基盤担当のみ編集）。file:// で動くクラシックスクリプト。 */
(function () {
  "use strict";

  var PAGES = [
    { id: "index", href: "index.html", label: "全体像" },
    { id: "react", href: "react.html", label: "React" },
    { id: "rust", href: "rust.html", label: "Rust" },
    { id: "android", href: "android.html", label: "Android" },
    { id: "inject", href: "inject.html", label: "inject" },
    { id: "howto", href: "howto.html", label: "機能追加ハウツー" },
  ];
  var STORE_PREFIX = "mcx-guide:";
  var FLOW_INTERVAL_MS = 1800;
  var SCRIPT_SRC = document.currentScript && document.currentScript.src;

  var data = (window.MCX_DATA = window.MCX_DATA || {});
  data.flows = data.flows || {};
  data.catalogs = data.catalogs || {};
  data.details = data.details || {};

  var currentPage = document.body.getAttribute("data-page") || "index";
  var catalogControllers = {};
  var panelOpener = null;
  var currentDetailId = null;

  /* ---------- 汎用ユーティリティ ---------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (html != null) node.innerHTML = html;
    return node;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function textOf(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || "";
  }
  function storeGet(key) {
    try {
      return window.localStorage.getItem(STORE_PREFIX + key);
    } catch (e) {
      return null;
    }
  }
  function storeSet(key, value) {
    try {
      window.localStorage.setItem(STORE_PREFIX + key, value);
    } catch (e) {
      /* 保存できなくても表示は壊さない */
    }
  }
  function storeRemove(key) {
    try {
      window.localStorage.removeItem(STORE_PREFIX + key);
    } catch (e) {
      /* 無視 */
    }
  }

  /* 執筆ミスを画面と console に出す */
  function warnAuthor(target, message) {
    console.error("[MCX guide] " + message);
    var box = el(
      "div",
      { class: "mcx-warning", role: "alert" },
      "執筆ミス: " + esc(message),
    );
    if (target && target.parentNode)
      target.parentNode.insertBefore(box, target);
    else document.body.insertBefore(box, document.body.firstChild);
  }

  function pathList(files) {
    if (!files || !files.length) return "";
    return (
      '<ul class="dp-files">' +
      files
        .map(function (f) {
          return '<li><code class="path">' + esc(f) + "</code></li>";
        })
        .join("") +
      "</ul>"
    );
  }
  function docLinks(docs) {
    if (!docs || !docs.length) return "";
    return (
      '<ul class="dp-files">' +
      docs
        .map(function (d) {
          return '<li><a href="' + esc(d) + '">' + esc(d) + "</a></li>";
        })
        .join("") +
      "</ul>"
    );
  }

  /* ---------- テーマ ---------- */

  var THEMES = ["auto", "light", "dark"];
  var THEME_LABEL = { auto: "自動", light: "ライト", dark: "ダーク" };

  function currentTheme() {
    var t = storeGet("theme");
    return THEMES.indexOf(t) >= 0 ? t : "auto";
  }
  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }

  /* ---------- ヘッダー ---------- */

  function renderHeader() {
    var host = $("#mcx-header");
    if (!host) return;
    var nav = PAGES.map(function (p) {
      var cur = p.id === currentPage ? ' aria-current="page"' : "";
      return '<a href="' + p.href + '"' + cur + ">" + esc(p.label) + "</a>";
    }).join("");
    host.innerHTML =
      '<div class="hd">' +
      '<a class="hd-title" href="index.html">MCX 開発者ガイド</a>' +
      '<nav class="hd-nav" aria-label="ページ">' +
      nav +
      "</nav>" +
      '<div class="hd-tools">' +
      '<div class="hd-search" role="search">' +
      '<input type="search" id="mcx-search" placeholder="全体検索" aria-label="全体検索" autocomplete="off">' +
      '<div class="search-results" id="mcx-search-results" hidden></div>' +
      "</div>" +
      '<button type="button" class="btn toc-toggle" id="mcx-toc-toggle" aria-expanded="false">目次</button>' +
      '<button type="button" class="btn" id="mcx-theme" aria-label="テーマ切替"></button>' +
      "</div></div>";
    setupThemeButton();
    setupSearch();
  }

  function setupThemeButton() {
    var btn = $("#mcx-theme");
    function refresh() {
      btn.textContent = "テーマ: " + THEME_LABEL[currentTheme()];
    }
    btn.addEventListener("click", function () {
      var next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
      storeSet("theme", next);
      applyTheme(next);
      refresh();
    });
    refresh();
  }

  /* ---------- 目次 ---------- */

  function buildToc() {
    var toc = $("#mcx-toc");
    var content = $("#content");
    if (!toc || !content) return;
    var heads = $all("h2[id], h3[id]", content);
    var html = "<ul>";
    var open = false;
    heads.forEach(function (h) {
      if (h.tagName === "H2") {
        if (open) html += "</ul></li>";
        html +=
          '<li><a href="#' + esc(h.id) + '">' + esc(h.textContent) + "</a>";
        html += "<ul>";
        open = true;
      } else {
        html +=
          '<li><a href="#' +
          esc(h.id) +
          '">' +
          esc(h.textContent) +
          "</a></li>";
      }
    });
    if (open) html += "</ul></li>";
    toc.innerHTML = html + "</ul>";
    toc.setAttribute("aria-label", "目次");
    setupTocCollapse(toc);
    trackActiveHeading(toc, heads);
  }

  function setupTocCollapse(toc) {
    var btn = $("#mcx-toc-toggle");
    var mq = window.matchMedia("(max-width: 899px)");
    function setCollapsed(c) {
      toc.setAttribute("data-collapsed", c ? "true" : "false");
      if (btn) btn.setAttribute("aria-expanded", c ? "false" : "true");
    }
    setCollapsed(mq.matches);
    if (btn)
      btn.addEventListener("click", function () {
        setCollapsed(toc.getAttribute("data-collapsed") !== "true");
        toc.scrollIntoView({ block: "nearest" });
      });
    var onChange = function () {
      setCollapsed(mq.matches);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
  }

  function trackActiveHeading(toc, heads) {
    var links = {};
    $all("a", toc).forEach(function (a) {
      links[a.getAttribute("href").slice(1)] = a;
    });
    var ticking = false;
    function update() {
      ticking = false;
      var active = null;
      heads.forEach(function (h) {
        if (h.getBoundingClientRect().top < 100) active = h;
      });
      Object.keys(links).forEach(function (k) {
        links[k].classList.toggle("active", !!active && active.id === k);
      });
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();
  }

  /* ---------- 用語ツールチップ ---------- */

  function setupTerms() {
    var tip = null;
    function hide() {
      if (tip) tip.remove();
      tip = null;
    }
    function show(term) {
      hide();
      tip = el("div", { class: "term-tip", role: "tooltip" });
      tip.textContent = term.getAttribute("data-term");
      document.body.appendChild(tip);
      var r = term.getBoundingClientRect();
      var left = Math.max(
        8,
        Math.min(
          r.left + window.scrollX,
          window.scrollX + window.innerWidth - tip.offsetWidth - 8,
        ),
      );
      tip.style.left = left + "px";
      tip.style.top = r.bottom + window.scrollY + 6 + "px";
    }
    $all(".term[data-term]").forEach(function (t) {
      if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
      t.addEventListener("mouseenter", function () {
        show(t);
      });
      t.addEventListener("mouseleave", hide);
      t.addEventListener("focus", function () {
        show(t);
      });
      t.addEventListener("blur", hide);
      t.addEventListener("click", function () {
        show(t);
      });
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest || !e.target.closest(".term")) hide();
    });
  }

  /* ---------- 詳細パネル ---------- */

  function panel() {
    var p = $("#mcx-detail");
    if (!p) {
      p = el("aside", { id: "mcx-detail", hidden: "" });
      document.body.appendChild(p);
    }
    return p;
  }

  function markSelectedNodes(id) {
    $all("[data-detail]").forEach(function (n) {
      if (n.classList.contains("dg-node"))
        n.setAttribute(
          "aria-pressed",
          String(n.getAttribute("data-detail") === id),
        );
    });
  }

  function detailHtml(d) {
    var related = (d.related || [])
      .map(function (rid) {
        var r = data.details[rid];
        return (
          '<button type="button" class="btn" data-related="' +
          esc(rid) +
          '">' +
          esc(r ? r.title : rid) +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="dp-head"><div><span class="badge" data-layer="' +
      esc(d.layer || "common") +
      '">' +
      esc(d.layer || "common") +
      "</span><h3>" +
      esc(d.title) +
      '</h3></div><button type="button" class="btn" data-close aria-label="閉じる">×</button></div>' +
      (d.summary ? '<p class="dp-summary">' + esc(d.summary) + "</p>" : "") +
      (d.body ? '<div class="dp-body">' + d.body + "</div>" : "") +
      (d.files && d.files.length
        ? '<div class="dp-sec"><h4>関連ファイル</h4>' +
          pathList(d.files) +
          "</div>"
        : "") +
      (d.docs && d.docs.length
        ? '<div class="dp-sec"><h4>関連資料</h4>' + docLinks(d.docs) + "</div>"
        : "") +
      (related
        ? '<div class="dp-sec"><h4>関連</h4><div class="dp-related">' +
          related +
          "</div></div>"
        : "")
    );
  }

  function openDetail(id, opener) {
    var d = data.details[id];
    if (!d) {
      warnAuthor(
        opener || null,
        "data-detail「" + id + "」が MCX_DATA.details に定義されていません",
      );
      return;
    }
    var p = panel();
    if (!currentDetailId) panelOpener = opener || document.activeElement;
    currentDetailId = id;
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", d.title);
    p.innerHTML = detailHtml(d);
    p.hidden = false;
    p.scrollTop = 0;
    markSelectedNodes(id);
    var close = $("[data-close]", p);
    if (close) close.focus();
  }

  function closeDetail() {
    var p = panel();
    if (p.hidden) return;
    p.hidden = true;
    currentDetailId = null;
    markSelectedNodes(null);
    if (panelOpener && panelOpener.focus) panelOpener.focus();
    panelOpener = null;
  }

  function setupDetailPanel() {
    var p = panel();
    p.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : e.target.parentNode;
      if (t.closest("[data-close]")) closeDetail();
      var rel = t.closest("[data-related]");
      if (rel) openDetail(rel.getAttribute("data-related"), panelOpener);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !p.hidden) closeDetail();
    });
    $all("#content [data-detail]").forEach(function (n) {
      var id = n.getAttribute("data-detail");
      if (!data.details[id]) {
        warnAuthor(
          n,
          "data-detail「" + id + "」が MCX_DATA.details に定義されていません",
        );
        return;
      }
      n.addEventListener("click", function () {
        if (currentDetailId === id) closeDetail();
        else openDetail(id, n);
      });
    });
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  }

  /* #detail=<id> で詳細パネルを開く */
  function openFromHash() {
    var m = /^#detail=(.+)$/.exec(window.location.hash);
    if (m) openDetail(decodeURIComponent(m[1]), null);
  }

  /* ---------- flow（シーケンス図） ---------- */

  var LANE_W = 180;
  var HEAD_H = 40;

  function textWidth(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 12 : 6.8;
    return w;
  }
  function wrapText(s, maxW) {
    var lines = [];
    var cur = "";
    var curW = 0;
    for (var i = 0; i < s.length; i++) {
      var cw = textWidth(s[i]);
      if (curW + cw > maxW && cur) {
        lines.push(cur);
        cur = "";
        curW = 0;
      }
      cur += s[i];
      curW += cw;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  function svgText(lines, x, y, anchor, extra) {
    return (
      '<text x="' +
      x +
      '" y="' +
      y +
      '" text-anchor="' +
      anchor +
      '"' +
      (extra || "") +
      ">" +
      lines
        .map(function (ln, i) {
          return (
            '<tspan x="' +
            x +
            '" dy="' +
            (i === 0 ? 0 : 14) +
            '">' +
            esc(ln) +
            "</tspan>"
          );
        })
        .join("") +
      "</text>"
    );
  }

  function arrowHead(x, y, dir) {
    return (
      '<polygon points="' +
      x +
      "," +
      y +
      " " +
      (x - dir * 9) +
      "," +
      (y - 5) +
      " " +
      (x - dir * 9) +
      "," +
      (y + 5) +
      '"/>'
    );
  }

  function stepSvg(step, idx, geom) {
    var fx = geom.xs[step.from];
    var tx = geom.xs[step.to];
    var kind = step.kind || "call";
    var y = geom.ys[idx];
    var label = wrapText(step.label || "", geom.labelW[idx]);
    var cls = "fl-step " + kind;
    var num =
      '<text class="fl-num" x="' +
      (Math.min(fx, tx) - 6) +
      '" y="' +
      (y - 4) +
      '" text-anchor="end">' +
      (idx + 1) +
      "</text>";
    var g;
    if (fx === tx) {
      g =
        '<path class="fl-loop" d="M' +
        fx +
        " " +
        (y - 8) +
        " h34 v22 h-34" +
        '"/>' +
        arrowHead(fx, y + 14, -1) +
        svgText(label, fx + 42, y - 2, "start");
    } else {
      var dir = tx > fx ? 1 : -1;
      g =
        '<line x1="' +
        fx +
        '" y1="' +
        y +
        '" x2="' +
        (tx - dir * 9) +
        '" y2="' +
        y +
        '"/>' +
        arrowHead(tx, y, dir) +
        svgText(
          label,
          (fx + tx) / 2,
          y - 8 - (label.length - 1) * 14,
          "middle",
        );
    }
    return '<g class="' + cls + '" data-step="' + idx + '">' + g + num + "</g>";
  }

  function flowGeometry(flow) {
    var xs = {};
    flow.actors.forEach(function (a, i) {
      xs[a.id] = i * LANE_W + LANE_W / 2;
    });
    var ys = [];
    var labelW = [];
    var y = HEAD_H + 30;
    flow.steps.forEach(function (s, i) {
      var self = s.from === s.to;
      var span = self
        ? 220
        : Math.max(Math.abs(xs[s.to] - xs[s.from]) - 24, 120);
      labelW[i] = span;
      var lines = wrapText(s.label || "", span).length;
      y += self ? 0 : (lines - 1) * 14;
      ys[i] = y;
      y += self ? 40 + (lines - 1) * 14 : 36;
    });
    var hasSelfLast = flow.steps.some(function (s) {
      return s.from === s.to && xs[s.from] > (flow.actors.length - 2) * LANE_W;
    });
    return {
      xs: xs,
      ys: ys,
      labelW: labelW,
      width: flow.actors.length * LANE_W + (hasSelfLast ? 240 : 0),
      height: y + 10,
    };
  }

  function flowSvg(flow) {
    var geom = flowGeometry(flow);
    var parts = [
      '<svg class="fl-svg" width="' +
        geom.width +
        '" height="' +
        geom.height +
        '" viewBox="0 0 ' +
        geom.width +
        " " +
        geom.height +
        '" role="img" aria-label="' +
        esc(flow.title) +
        '">',
    ];
    flow.actors.forEach(function (a) {
      var x = geom.xs[a.id];
      parts.push(
        '<line class="fl-life" x1="' +
          x +
          '" y1="' +
          HEAD_H +
          '" x2="' +
          x +
          '" y2="' +
          (geom.height - 4) +
          '"/>',
      );
      parts.push(
        '<g class="fl-actor" data-layer="' +
          esc(a.layer || "common") +
          '" data-actor="' +
          esc(a.id) +
          '">' +
          '<rect x="' +
          (x - LANE_W / 2 + 8) +
          '" y="4" width="' +
          (LANE_W - 16) +
          '" height="' +
          (HEAD_H - 6) +
          '" rx="8"/>' +
          svgText(
            wrapText(a.label, LANE_W - 28).slice(0, 2),
            x,
            wrapText(a.label, LANE_W - 28).length > 1 ? 18 : 25,
            "middle",
          ) +
          "</g>",
      );
    });
    flow.steps.forEach(function (s, i) {
      parts.push(stepSvg(s, i, geom));
    });
    parts.push("</svg>");
    return parts.join("");
  }

  function validateFlow(host, flow) {
    var ids = {};
    flow.actors.forEach(function (a) {
      ids[a.id] = true;
    });
    return flow.steps.every(function (s, i) {
      var ok = ids[s.from] && ids[s.to];
      if (!ok)
        warnAuthor(
          host,
          "flow「" +
            host.getAttribute("data-flow") +
            "」のステップ " +
            (i + 1) +
            " が未定義のアクターを参照しています",
        );
      return ok;
    });
  }

  function setupFlow(host) {
    var id = host.getAttribute("data-flow");
    var flow = data.flows[id];
    if (!flow || !flow.actors || !flow.steps) {
      warnAuthor(
        host,
        "data-flow「" + id + "」が MCX_DATA.flows に定義されていません",
      );
      return;
    }
    if (!validateFlow(host, flow)) return;
    host.setAttribute("tabindex", "0");
    host.setAttribute("aria-label", flow.title + "（←/→ でステップ移動）");
    host.innerHTML =
      '<div class="fl-title">' +
      esc(flow.title) +
      "</div>" +
      (flow.description
        ? '<div class="fl-desc">' + esc(flow.description) + "</div>"
        : "") +
      '<div class="fl-scroll">' +
      flowSvg(flow) +
      "</div>" +
      '<div class="fl-ctrl">' +
      '<button type="button" class="btn" data-act="first" aria-label="最初">⏮ 最初</button>' +
      '<button type="button" class="btn" data-act="prev">◀ 前</button>' +
      '<button type="button" class="btn" data-act="play">▶ 再生</button>' +
      '<button type="button" class="btn" data-act="next">次 ▶</button>' +
      '<span class="fl-count" aria-live="polite"></span></div>' +
      '<div class="fl-detail" aria-live="polite"></div>';
    flowController(host, flow);
  }

  function flowController(host, flow) {
    var cur = 0;
    var timer = null;
    var last = flow.steps.length - 1;
    var playBtn = $('[data-act="play"]', host);

    function render() {
      $all(".fl-step", host).forEach(function (g) {
        var i = Number(g.getAttribute("data-step"));
        g.classList.toggle("current", i === cur);
        g.classList.toggle("done", i < cur);
      });
      var s = flow.steps[cur];
      $all(".fl-actor", host).forEach(function (a) {
        var aid = a.getAttribute("data-actor");
        a.classList.toggle("on", aid === s.from || aid === s.to);
      });
      $(".fl-count", host).textContent =
        "ステップ " + (cur + 1) + " / " + flow.steps.length;
      $(".fl-detail", host).innerHTML =
        "<h4>" +
        (cur + 1) +
        ". " +
        esc(s.label) +
        "</h4>" +
        (s.detail || "") +
        (s.files && s.files.length ? pathList(s.files) : "");
      var cur_g = $('.fl-step[data-step="' + cur + '"]', host);
      scrollIntoLane(cur_g);
    }
    function scrollIntoLane(g) {
      var box = $(".fl-scroll", host);
      if (!g || !box || !g.getBBox) return;
      var bb = g.getBBox();
      if (
        bb.x < box.scrollLeft ||
        bb.x + bb.width > box.scrollLeft + box.clientWidth
      ) {
        box.scrollLeft = Math.max(0, bb.x - 20);
      }
    }
    function go(i) {
      cur = Math.max(0, Math.min(last, i));
      render();
    }
    function stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
      playBtn.textContent = "▶ 再生";
    }
    function play() {
      if (cur >= last) go(0);
      playBtn.textContent = "⏸ 停止";
      timer = window.setInterval(function () {
        if (cur >= last) stop();
        else go(cur + 1);
      }, FLOW_INTERVAL_MS);
    }
    host.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : e.target.parentNode;
      var btn = t.closest("[data-act]");
      var stepG = t.closest(".fl-step");
      if (btn) {
        var act = btn.getAttribute("data-act");
        if (act === "play") timer ? stop() : play();
        else {
          stop();
          go(act === "first" ? 0 : act === "prev" ? cur - 1 : cur + 1);
        }
      } else if (stepG) {
        stop();
        go(Number(stepG.getAttribute("data-step")));
      }
    });
    host.addEventListener("keydown", function (e) {
      if (e.target !== host) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        stop();
        go(cur + (e.key === "ArrowRight" ? 1 : -1));
      }
    });
    render();
  }

  /* ---------- catalog ---------- */

  function itemText(cat, item) {
    var cols = cat.columns.map(function (c) {
      return item[c.key];
    });
    return (
      cols.join(" ") +
      " " +
      textOf(item.detail) +
      " " +
      (item.files || []).join(" ")
    ).toLowerCase();
  }

  function filterValues(cat, key) {
    var seen = [];
    cat.items.forEach(function (it) {
      var v = it[key];
      if (v != null && v !== "" && seen.indexOf(v) < 0) seen.push(v);
    });
    return seen;
  }

  function setupCatalog(host) {
    var id = host.getAttribute("data-catalog");
    var cat = data.catalogs[id];
    if (!cat || !cat.items || !cat.columns) {
      warnAuthor(
        host,
        "data-catalog「" + id + "」が MCX_DATA.catalogs に定義されていません",
      );
      return;
    }
    var state = { query: "", selected: {}, open: {} };
    (cat.filters || []).forEach(function (f) {
      state.selected[f.key] = {};
    });
    var texts = cat.items.map(function (it) {
      return itemText(cat, it);
    });

    host.innerHTML =
      '<div class="cat-title">' +
      esc(cat.title || id) +
      "</div>" +
      '<input type="search" class="cat-search" placeholder="検索（名前・概要・詳細）" aria-label="' +
      esc(cat.title || id) +
      ' を検索">' +
      '<div class="cat-filters"></div><div class="cat-count" aria-live="polite"></div><div class="cat-body"></div>';
    renderFilters();
    render();

    function matches(i) {
      var it = cat.items[i];
      var terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
      var okQ = terms.every(function (t) {
        return texts[i].indexOf(t) >= 0;
      });
      var okF = (cat.filters || []).every(function (f) {
        var sel = Object.keys(state.selected[f.key]);
        return sel.length === 0 || sel.indexOf(String(it[f.key])) >= 0;
      });
      return okQ && okF;
    }

    function renderFilters() {
      var box = $(".cat-filters", host);
      box.innerHTML = (cat.filters || [])
        .map(function (f) {
          return (
            '<span class="fg-label">' +
            esc(f.label) +
            "</span>" +
            filterValues(cat, f.key)
              .map(function (v) {
                var on = state.selected[f.key][v] ? "true" : "false";
                return (
                  '<button type="button" class="chip" data-fk="' +
                  esc(f.key) +
                  '" data-fv="' +
                  esc(v) +
                  '" aria-pressed="' +
                  on +
                  '">' +
                  esc(v) +
                  "</button>"
                );
              })
              .join("")
          );
        })
        .join("");
    }

    function rowHtml(i) {
      var it = cat.items[i];
      var open = state.open[i];
      var cells = cat.columns
        .map(function (c) {
          var v = it[c.key] == null ? "" : esc(it[c.key]);
          return "<td>" + (c.code ? "<code>" + v + "</code>" : v) + "</td>";
        })
        .join("");
      var row =
        '<tr class="cat-row' +
        (open ? " open" : "") +
        '" data-idx="' +
        i +
        '" tabindex="0" aria-expanded="' +
        !!open +
        '">' +
        cells +
        "</tr>";
      if (!open) return row;
      return (
        row +
        '<tr class="cat-detail"><td colspan="' +
        cat.columns.length +
        '"><div class="cd-body">' +
        (it.detail || "") +
        (it.files && it.files.length ? pathList(it.files) : "") +
        "</div></td></tr>"
      );
    }

    function render() {
      var idxs = [];
      cat.items.forEach(function (_, i) {
        if (matches(i)) idxs.push(i);
      });
      $(".cat-count", host).textContent =
        idxs.length + " / " + cat.items.length + " 件";
      $(".cat-body", host).innerHTML = idxs.length
        ? '<table class="cat-table"><thead><tr>' +
          cat.columns
            .map(function (c) {
              return "<th>" + esc(c.label) + "</th>";
            })
            .join("") +
          "</tr></thead><tbody>" +
          idxs.map(rowHtml).join("") +
          "</tbody></table>"
        : '<div class="cat-empty">該当する項目がありません</div>';
    }

    function toggle(i) {
      state.open[i] = !state.open[i];
      render();
      var row = $('.cat-row[data-idx="' + i + '"]', host);
      if (row) row.focus();
    }

    $(".cat-search", host).addEventListener("input", function (e) {
      state.query = e.target.value;
      render();
    });
    host.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : e.target.parentNode;
      var chip = t.closest(".chip");
      if (chip) {
        var k = chip.getAttribute("data-fk");
        var v = chip.getAttribute("data-fv");
        if (state.selected[k][v]) delete state.selected[k][v];
        else state.selected[k][v] = true;
        renderFilters();
        render();
        return;
      }
      var row = t.closest(".cat-row");
      if (row && !t.closest("a")) toggle(Number(row.getAttribute("data-idx")));
    });
    host.addEventListener("keydown", function (e) {
      var row =
        e.target.classList && e.target.classList.contains("cat-row")
          ? e.target
          : null;
      if (row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        toggle(Number(row.getAttribute("data-idx")));
      }
    });

    /* 全体検索から項目を開く */
    catalogControllers[id] = {
      cat: cat,
      reveal: function (i) {
        state.query = "";
        $(".cat-search", host).value = "";
        (cat.filters || []).forEach(function (f) {
          state.selected[f.key] = {};
        });
        state.open[i] = true;
        renderFilters();
        render();
        var row = $('.cat-row[data-idx="' + i + '"]', host);
        if (row) row.scrollIntoView({ block: "center" });
      },
    };
  }

  /* ---------- checklist ---------- */

  function setupChecklist(list, seen) {
    var id = list.getAttribute("data-checklist");
    if (seen[id])
      warnAuthor(list, "data-checklist「" + id + "」が重複しています");
    seen[id] = true;
    var key = "checklist:" + id;
    var items = $all(":scope > li", list);
    var checked = loadChecked(key);

    var bar = el(
      "div",
      { class: "ck-bar" },
      '<progress max="' +
        items.length +
        '" value="0"></progress><span class="ck-text"></span><button type="button" class="btn ck-reset">リセット</button>',
    );
    list.parentNode.insertBefore(bar, list.nextSibling);

    items.forEach(function (li, i) {
      var cb = el("input", {
        type: "checkbox",
        "aria-label": "手順 " + (i + 1) + " 完了",
      });
      cb.checked = !!checked[i];
      cb.addEventListener("change", function () {
        checked[i] = cb.checked;
        sync();
      });
      li.insertBefore(cb, li.firstChild);
    });
    $(".ck-reset", bar).addEventListener("click", function () {
      checked = {};
      storeRemove(key);
      items.forEach(function (li) {
        $("input", li).checked = false;
      });
      sync(true);
    });

    function sync(skipSave) {
      var n = 0;
      items.forEach(function (li, i) {
        li.classList.toggle("done", !!checked[i]);
        if (checked[i]) n++;
      });
      $("progress", bar).value = n;
      $(".ck-text", bar).textContent = n + " / " + items.length;
      if (!skipSave) storeSet(key, JSON.stringify(checked));
    }
    sync(true);
  }

  function loadChecked(key) {
    try {
      var v = JSON.parse(storeGet(key) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch (e) {
      return {};
    }
  }

  /* ---------- tabs ---------- */

  function setupTabs(box) {
    var tabs = $all(":scope > .tab", box);
    if (!tabs.length) return;
    var bar = el("div", { class: "tab-bar", role: "tablist" });
    var buttons = tabs.map(function (tab, i) {
      var b = el("button", { type: "button", class: "tab-btn", role: "tab" });
      b.textContent =
        tab.getAttribute("data-label") || tab.getAttribute("data-tab");
      b.addEventListener("click", function () {
        select(i);
      });
      b.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") select((i + 1) % tabs.length, true);
        if (e.key === "ArrowLeft")
          select((i + tabs.length - 1) % tabs.length, true);
      });
      bar.appendChild(b);
      tab.setAttribute("role", "tabpanel");
      return b;
    });
    box.insertBefore(bar, box.firstChild);
    function select(n, focus) {
      tabs.forEach(function (t, i) {
        t.hidden = i !== n;
        buttons[i].setAttribute("aria-selected", String(i === n));
        buttons[i].tabIndex = i === n ? 0 : -1;
      });
      if (focus) buttons[n].focus();
    }
    select(0);
  }

  /* ---------- 全体検索 ---------- */

  function pageHref(page, id) {
    return page + ".html#" + encodeURIComponent(id);
  }

  function collectSearchEntries() {
    var out = [];
    $all("#content h2[id], #content h3[id]").forEach(function (h) {
      out.push({
        kind: "見出し",
        title: h.textContent,
        sub: "このページ",
        text: h.textContent,
        href: "#" + h.id,
      });
    });
    Object.keys(catalogControllers).forEach(function (cid) {
      var cat = catalogControllers[cid].cat;
      cat.items.forEach(function (it, i) {
        out.push({
          kind: "一覧",
          title: String(it[cat.columns[0].key]),
          sub:
            cat.title +
            " / " +
            (it[cat.columns[1] && cat.columns[1].key] || ""),
          text: itemText(cat, it),
          run: function () {
            revealCatalog(cid, i);
          },
        });
      });
    });
    Object.keys(data.details).forEach(function (did) {
      var d = data.details[did];
      out.push({
        kind: "詳細",
        title: d.title,
        sub: d.summary || "",
        text: (
          d.title +
          " " +
          (d.summary || "") +
          " " +
          textOf(d.body)
        ).toLowerCase(),
        run: function () {
          openDetail(did, null);
        },
      });
    });
    var localIds = {};
    out.forEach(function (e) {
      if (e.href) localIds[e.href.slice(1)] = true;
    });
    (data.index || []).forEach(function (e) {
      if (e.page === currentPage && localIds[e.id]) return;
      var label = (
        PAGES.filter(function (p) {
          return p.id === e.page;
        })[0] || { label: e.page }
      ).label;
      out.push({
        kind: "見出し",
        title: e.title,
        sub: label + " ページ",
        text: e.title,
        href: e.page === currentPage ? "#" + e.id : pageHref(e.page, e.id),
      });
    });
    return out;
  }

  function revealCatalog(cid, i) {
    var host = $('[data-catalog="' + cid + '"]');
    if (host) host.scrollIntoView({ block: "start" });
    catalogControllers[cid].reveal(i);
  }

  function runSearch(entries, query) {
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return entries
      .filter(function (e) {
        var hay = (e.title + " " + e.text).toLowerCase();
        return terms.every(function (t) {
          return hay.indexOf(t) >= 0;
        });
      })
      .slice(0, 40);
  }

  function setupSearch() {
    var input = $("#mcx-search");
    var box = $("#mcx-search-results");
    var entries = null;
    var results = [];

    function render() {
      if (!entries) entries = collectSearchEntries();
      results = runSearch(entries, input.value);
      if (!input.value.trim()) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      box.innerHTML = results.length
        ? results
            .map(function (r, i) {
              return (
                '<a class="sr-item" href="' +
                esc(r.href || "#") +
                '" data-i="' +
                i +
                '"><span class="sr-kind">' +
                esc(r.kind) +
                "</span>" +
                esc(r.title) +
                (r.sub ? "<small>" + esc(r.sub) + "</small>" : "") +
                "</a>"
              );
            })
            .join("")
        : '<div class="sr-empty">見つかりませんでした</div>';
    }
    input.addEventListener("input", render);
    input.addEventListener("focus", function () {
      entries = null;
      if (input.value) render();
    });
    box.addEventListener("click", function (e) {
      var a = (e.target.closest ? e.target : e.target.parentNode).closest(
        ".sr-item",
      );
      if (!a) return;
      var r = results[Number(a.getAttribute("data-i"))];
      if (r && r.run) {
        e.preventDefault();
        r.run();
      }
      box.hidden = true;
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        box.hidden = true;
        input.blur();
      }
      if (e.key === "ArrowDown") {
        var first = $(".sr-item", box);
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest || !e.target.closest(".hd-search"))
        box.hidden = true;
    });
  }

  /* ---------- 起動 ---------- */

  function init() {
    applyTheme(currentTheme());
    renderHeader();
    buildToc();
    setupTerms();
    setupDetailPanel();
    $all("[data-flow]").forEach(setupFlow);
    $all("[data-catalog]").forEach(setupCatalog);
    var seen = {};
    $all("[data-checklist]").forEach(function (l) {
      setupChecklist(l, seen);
    });
    $all(".tabs").forEach(setupTabs);
    if (window.location.hash && !/^#detail=/.test(window.location.hash))
      scrollToHash();
  }

  function scrollToHash() {
    var target = document.getElementById(
      decodeURIComponent(window.location.hash.slice(1)),
    );
    if (target) target.scrollIntoView();
  }

  /* 他ページの見出し索引（index.js）を、未読込なら動的に読み込んでから起動する */
  function boot() {
    applyTheme(currentTheme());
    if (data.index || !SCRIPT_SRC) {
      init();
      return;
    }
    var s = document.createElement("script");
    s.src = SCRIPT_SRC.replace(/common\.js(\?.*)?$/, "data/index.js");
    s.onload = s.onerror = init;
    document.body.appendChild(s);
  }

  boot();
})();

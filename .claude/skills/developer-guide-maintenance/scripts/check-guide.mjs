#!/usr/bin/env node
// 開発者ガイド（docs/developer-guide/）の整合性チェック。node 標準モジュールのみ使用。
// 使い方: リポジトリルートで `node .claude/skills/developer-guide-maintenance/scripts/check-guide.mjs [--json]`
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SCRIPT_DIR, "../../../..");
const GUIDE = path.join(REPO, "docs/developer-guide");
const DATA_DIR = path.join(GUIDE, "assets/data");
const JSON_MODE = process.argv.includes("--json");
const SKIP_DIRS = new Set([".git", "node_modules", "target"]);

const findings = []; // { level: "error" | "warn", check, where, message }
const add = (level, check, where, message) =>
  findings.push({ level, check, where, message });
const error = (check, where, message) => add("error", check, where, message);
const warn = (check, where, message) => add("warn", check, where, message);

/* ---------- 入力の読み込み ---------- */

function listHtmlPages() {
  if (!fs.existsSync(GUIDE)) return [];
  return fs
    .readdirSync(GUIDE)
    .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
    .sort()
    .map((file) => ({
      file,
      pageId: file.replace(/\.html$/, ""),
      html: fs.readFileSync(path.join(GUIDE, file), "utf8"),
    }));
}

function loadData() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  if (!fs.existsSync(DATA_DIR)) return sandbox.window.MCX_DATA ?? emptyData();
  for (const f of fs
    .readdirSync(DATA_DIR)
    .filter((n) => n.endsWith(".js"))
    .sort()) {
    try {
      vm.runInContext(
        fs.readFileSync(path.join(DATA_DIR, f), "utf8"),
        sandbox,
        { filename: f },
      );
    } catch (e) {
      error("data", `assets/data/${f}`, `評価に失敗: ${e.message}`);
    }
  }
  const d = sandbox.window.MCX_DATA ?? emptyData();
  return { flows: {}, catalogs: {}, details: {}, index: [], ...d };
}
const emptyData = () => ({ flows: {}, catalogs: {}, details: {}, index: [] });

/* ---------- パス存在確認 ---------- */

function decodeEntities(s) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function globToRegex(pattern) {
  const body = pattern
    .split("**")
    .map((seg) =>
      seg
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[]\]/g, "\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${body}$`);
}

// グロブは静的な先頭ディレクトリ以下を再帰走査し、1 件でも一致すれば存在とみなす
function globMatches(pattern) {
  const parts = pattern.split("/");
  const staticParts = [];
  while (parts.length && !parts[0].includes("*"))
    staticParts.push(parts.shift());
  const root = path.join(REPO, ...staticParts);
  if (!fs.existsSync(root)) return false;
  const re = globToRegex(parts.join("/"));
  const walk = (dir, rel) =>
    fs.readdirSync(dir, { withFileTypes: true }).some((ent) => {
      if (SKIP_DIRS.has(ent.name)) return false;
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      return (
        re.test(r) || (ent.isDirectory() && walk(path.join(dir, ent.name), r))
      );
    });
  return walk(root, "");
}

function repoPathExists(raw) {
  const p = raw.replace(/:\d+(-\d+)?$/, "").replace(/^\.\//, "");
  if (!p) return false;
  if (p.includes("*")) return globMatches(p);
  const full = path.join(REPO, p);
  if (!fs.existsSync(full)) return false;
  return p.endsWith("/") ? fs.statSync(full).isDirectory() : true;
}

function checkRepoPath(where, raw) {
  if (!repoPathExists(raw)) error("path", where, `存在しないパス: ${raw}`);
}

function pathsInHtml(html) {
  const out = [];
  const re = /<code\s+class="path"[^>]*>([\s\S]*?)<\/code\s*>/g;
  for (let m; (m = re.exec(html)); ) out.push(decodeEntities(m[1]).trim());
  return out;
}

function checkPaths(pages, data) {
  for (const p of pages)
    for (const raw of pathsInHtml(p.html)) checkRepoPath(p.file, raw);
  const each = (where, files) =>
    (files ?? []).forEach((f) => checkRepoPath(where, f));
  for (const [id, d] of Object.entries(data.details)) {
    each(`details[${id}].files`, d.files);
    pathsInHtml(d.body ?? "").forEach((f) =>
      checkRepoPath(`details[${id}].body`, f),
    );
  }
  for (const [id, fl] of Object.entries(data.flows)) {
    (fl.steps ?? []).forEach((s, i) => {
      each(`flows[${id}].steps[${i + 1}].files`, s.files);
      pathsInHtml(s.detail ?? "").forEach((f) =>
        checkRepoPath(`flows[${id}].steps[${i + 1}].detail`, f),
      );
    });
  }
  for (const [id, c] of Object.entries(data.catalogs)) {
    (c.items ?? []).forEach((it) => {
      each(`catalogs[${id}][${it.name ?? "?"}].files`, it.files);
      pathsInHtml(it.detail ?? "").forEach((f) =>
        checkRepoPath(`catalogs[${id}][${it.name ?? "?"}].detail`, f),
      );
    });
  }
}

/* ---------- リンク・アンカー ---------- */

function idsInHtml(html) {
  const ids = [];
  const re = /\sid="([^"]+)"/g;
  for (let m; (m = re.exec(html)); ) ids.push(m[1]);
  return ids;
}

function checkDuplicateIds(pages) {
  for (const p of pages) {
    const seen = new Set();
    for (const id of idsInHtml(p.html)) {
      if (seen.has(id)) error("link", p.file, `id が重複: ${id}`);
      seen.add(id);
    }
  }
}

function isExternalLink(url) {
  return (
    /^(https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(url) || url === "#"
  );
}

function checkLink(where, baseDir, url, pageIds, data) {
  if (isExternalLink(url)) return;
  const [rawPath, hash = ""] = url.split("#");
  const target = rawPath.split("?")[0];
  if (!target) {
    checkHash(where, hash, pageIds.__self, data);
    return;
  }
  const full = path.resolve(baseDir, decodeURI(target));
  if (!fs.existsSync(full)) {
    error("link", where, `リンク先が存在しない: ${url}`);
    return;
  }
  if (hash && full.endsWith(".html") && path.dirname(full) === GUIDE) {
    checkHash(where, hash, pageIds[path.basename(full)], data, url);
  }
}

function checkHash(where, hash, ids, data, url) {
  if (!hash) return;
  const detail = /^detail=(.+)$/.exec(hash);
  if (detail) {
    if (!data.details[decodeURIComponent(detail[1])])
      error("link", where, `存在しない詳細 id: ${url ?? "#" + hash}`);
    return;
  }
  if (ids && !ids.includes(decodeURIComponent(hash)))
    error(
      "link",
      where,
      `リンク先ページにアンカーが無い: ${url ?? "#" + hash}`,
    );
}

function linksInHtml(html) {
  const out = [];
  const re = /\s(?:href|src)="([^"]*)"/g;
  for (let m; (m = re.exec(html)); ) out.push(m[1].replace(/&amp;/g, "&"));
  return out;
}

function checkLinks(pages, data) {
  const pageIds = Object.fromEntries(
    pages.map((p) => [p.file, idsInHtml(p.html)]),
  );
  for (const p of pages) {
    const ids = { ...pageIds, __self: pageIds[p.file] };
    for (const url of linksInHtml(p.html))
      checkLink(p.file, GUIDE, url, ids, data);
  }
  const noSelf = { ...pageIds, __self: null };
  for (const [id, d] of Object.entries(data.details)) {
    (d.docs ?? []).forEach((doc) =>
      checkLink(`details[${id}].docs`, GUIDE, doc, noSelf, data),
    );
    linksInHtml(d.body ?? "").forEach((u) =>
      checkLink(`details[${id}].body`, GUIDE, u, noSelf, data),
    );
  }
}

/* ---------- data-* 参照 ---------- */

function attrValues(html, attr) {
  const out = [];
  const re = new RegExp(`\\s${attr}="([^"]+)"`, "g");
  for (let m; (m = re.exec(html)); ) out.push(m[1]);
  return out;
}

function checkReferences(pages, data) {
  const defs = {
    "data-detail": data.details,
    "data-flow": data.flows,
    "data-catalog": data.catalogs,
  };
  for (const p of pages) {
    for (const [attr, table] of Object.entries(defs)) {
      for (const id of attrValues(p.html, attr)) {
        if (!table[id])
          error(
            "ref",
            p.file,
            `${attr}="${id}" が assets/data に定義されていない`,
          );
      }
    }
  }
  const ck = new Map();
  for (const p of pages) {
    for (const id of attrValues(p.html, "data-checklist")) {
      if (ck.has(id))
        error(
          "ref",
          p.file,
          `data-checklist="${id}" が重複（${ck.get(id)} にも存在）`,
        );
      ck.set(id, p.file);
    }
  }
  checkDataIntegrity(data);
}

function checkDataIntegrity(data) {
  for (const [id, d] of Object.entries(data.details)) {
    for (const r of d.related ?? []) {
      if (!data.details[r])
        error("ref", `details[${id}].related`, `存在しない詳細 id: ${r}`);
    }
  }
  for (const [id, fl] of Object.entries(data.flows)) {
    const actors = new Set((fl.actors ?? []).map((a) => a.id));
    (fl.steps ?? []).forEach((s, i) => {
      for (const end of [s.from, s.to]) {
        if (!actors.has(end))
          error(
            "ref",
            `flows[${id}].steps[${i + 1}]`,
            `未定義のアクター: ${end}`,
          );
      }
    });
  }
}

/* ---------- 同期コミット meta ---------- */

function checkSyncedCommit(pages) {
  const values = new Map();
  for (const p of pages) {
    const m = /<meta\s+name="mcx-synced-commit"\s+content="([^"]*)"/.exec(
      p.html,
    );
    if (!m) {
      error("meta", p.file, "mcx-synced-commit meta が無い");
      continue;
    }
    values.set(p.file, m[1]);
  }
  if (new Set(values.values()).size > 1) {
    const detail = [...values].map(([f, v]) => `${f}=${v}`).join(", ");
    error(
      "meta",
      "全ページ",
      `mcx-synced-commit がページ間で不一致: ${detail}`,
    );
  }
  return [...values.values()][0] ?? null;
}

/* ---------- Rust コマンド一覧 ---------- */

function parseBuildRsCommands() {
  const file = path.join(REPO, "src-tauri/build.rs");
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
  const m = /\.commands\(\s*&\[([\s\S]*?)\]\s*\)/.exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function checkRustCommands(data) {
  const cat = data.catalogs["rust.commands"];
  if (!cat) return;
  const actual = parseBuildRsCommands();
  if (!actual) {
    warn(
      "commands",
      "src-tauri/build.rs",
      "AppManifest の commands を解析できなかった",
    );
    return;
  }
  const documented = new Set((cat.items ?? []).map((i) => i.name));
  const real = new Set(actual);
  for (const n of real)
    if (!documented.has(n))
      warn("commands", "rust.commands", `ドキュメントに無いコマンド: ${n}`);
  for (const n of documented)
    if (!real.has(n))
      warn("commands", "rust.commands", `build.rs に存在しないコマンド: ${n}`);
}

/* ---------- 見出し索引 ---------- */

function headingIds(html, level) {
  const out = [];
  const re = new RegExp(`<h${level}\\b[^>]*\\sid="([^"]+)"`, "g");
  for (let m; (m = re.exec(html)); ) out.push(m[1]);
  return out;
}

function checkIndex(pages, data) {
  const byId = Object.fromEntries(pages.map((p) => [p.pageId, p]));
  const indexed = new Set();
  for (const e of data.index ?? []) {
    indexed.add(`${e.page}#${e.id}`);
    const page = byId[e.page];
    if (!page) continue; // 未作成ページはスキップ
    if (!idsInHtml(page.html).includes(e.id))
      error(
        "index",
        `index[${e.page}#${e.id}]`,
        "索引のリンク先 id がページに存在しない",
      );
  }
  for (const p of pages) {
    for (const id of headingIds(p.html, 2)) {
      if (!indexed.has(`${p.pageId}#${id}`))
        error("index", p.file, `h2「${id}」が MCX_DATA.index に未登録`);
    }
    for (const id of headingIds(p.html, 3)) {
      if (!indexed.has(`${p.pageId}#${id}`))
        warn("index", p.file, `h3「${id}」が MCX_DATA.index に未登録（任意）`);
    }
  }
}

/* ---------- 出力 ---------- */

function report(pages, commit) {
  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        {
          pages: pages.map((p) => p.file),
          syncedCommit: commit,
          errors,
          warnings: warns,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `開発者ガイド検査: ${pages.length} ページ（${pages.map((p) => p.file).join(", ") || "なし"}）`,
    );
    console.log(`同期基準コミット: ${commit ?? "不明"}`);
    printGroup("エラー", errors);
    printGroup("警告", warns);
    console.log(
      errors.length
        ? `\n結果: 失敗（エラー ${errors.length} 件 / 警告 ${warns.length} 件）`
        : `\n結果: OK（警告 ${warns.length} 件）`,
    );
  }
  process.exit(errors.length ? 1 : 0);
}

function printGroup(title, items) {
  if (!items.length) return;
  console.log(`\n[${title}] ${items.length} 件`);
  for (const f of items)
    console.log(`  - (${f.check}) ${f.where}: ${f.message}`);
}

function main() {
  const pages = listHtmlPages();
  const data = loadData();
  checkPaths(pages, data);
  checkDuplicateIds(pages);
  checkLinks(pages, data);
  checkReferences(pages, data);
  const commit = checkSyncedCommit(pages);
  checkRustCommands(data);
  checkIndex(pages, data);
  report(pages, commit);
}

main();

// 開発者ガイド各ページの h2 / h3 から全ページ横断検索の見出し索引を生成し、
// docs/developer-guide/assets/data/index.js の索引ブロックを書き換える。
// 使い方（リポジトリルートで）: node .claude/skills/developer-guide-maintenance/scripts/build-index.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const GUIDE = path.join(ROOT, "docs/developer-guide");
const INDEX_JS = path.join(GUIDE, "assets/data/index.js");
const PAGE_ORDER = ["index", "react", "rust", "android", "inject", "howto"];
const BEGIN = "// <mcx-index:begin> build-index.mjs が生成（手で編集しない）";
const END = "// <mcx-index:end>";

function headingText(inner) {
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function headingsOf(page) {
  const html = fs.readFileSync(path.join(GUIDE, `${page}.html`), "utf8");
  const re = /<h([23])\s[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1\s*>/g;
  const out = [];
  for (let m; (m = re.exec(html)); )
    out.push({ page, id: m[2], title: headingText(m[3]), level: Number(m[1]) });
  return out;
}

function renderBlock(entries) {
  const lines = entries.map(
    (e) =>
      `  { page: ${JSON.stringify(e.page)}, id: ${JSON.stringify(e.id)}, title: ${JSON.stringify(e.title)}, level: ${e.level} },`,
  );
  return [BEGIN, "window.MCX_DATA.index.push(", ...lines, ");", END].join("\n");
}

function replaceBlock(src, block) {
  const begin = src.indexOf(BEGIN);
  const end = src.indexOf(END);
  if (begin >= 0 && end > begin)
    return src.slice(0, begin) + block + src.slice(end + END.length);
  // 初回: 既存の空 push(...) を置き換える
  const legacy = /window\.MCX_DATA\.index\.push\([\s\S]*?\);/;
  if (!legacy.test(src))
    throw new Error("index.js に索引ブロックが見つかりません");
  return src.replace(legacy, block);
}

const pages = PAGE_ORDER.filter((p) =>
  fs.existsSync(path.join(GUIDE, `${p}.html`)),
);
const entries = pages.flatMap(headingsOf);
fs.writeFileSync(
  INDEX_JS,
  replaceBlock(fs.readFileSync(INDEX_JS, "utf8"), renderBlock(entries)),
);
console.log(
  `見出し索引を更新しました: ${pages.length} ページ / ${entries.length} 件 → ${path.relative(ROOT, INDEX_JS)}`,
);

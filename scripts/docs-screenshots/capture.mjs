// storybook-static を静的配信し、playwright(chromium) で各ストーリーを docs/guide/images に撮影する。
// 使い方: npm run docs:screenshots（storybook build を前段実行）
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildStoryUrl, findMissingStoryIds } from "./lib.mjs";
import { targets } from "./targets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const staticDir = join(root, "storybook-static");
const outDir = join(root, "docs", "guide", "images");
// Storybook の preview はアプリのグローバル CSS（テーマ変数・リセット）を読み込まないため、
// 撮影時に src/index.css を注入して実アプリと同じ見た目にする。
const appCssPath = join(root, "src", "index.css");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://x").pathname,
      );
      let file = normalize(join(staticDir, pathname));
      // ディレクトリトラバーサル防止
      if (file !== staticDir && !file.startsWith(staticDir + sep)) {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(file).catch(() => null))?.isDirectory()) {
        file = join(file, "index.html");
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// フォーカスリングを消し、スクロール可能な領域を先頭に戻す（play function の操作痕を残さない）
async function normalizePage(page) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
}

// clip: 矩形 {x,y,width,height} / "dialog"（オーバーレイ直下のダイアログ本体 + 余白）/ 未指定（全体）
async function resolveClip(page, clip) {
  if (clip === undefined) return undefined;
  if (clip !== "dialog") return clip;
  const box = await page
    .locator("#storybook-root > * > *")
    .first()
    .boundingBox();
  if (!box) throw new Error("dialog の位置を取得できません");
  const pad = 16;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    x,
    y,
    width: box.width + (box.x - x) + pad,
    height: box.height + (box.y - y) + pad,
  };
}

async function main() {
  const indexJson = JSON.parse(
    await readFile(join(staticDir, "index.json"), "utf8"),
  );
  const missing = findMissingStoryIds(targets, indexJson);
  if (missing.length > 0) {
    console.error(`index.json に存在しない storyId: ${missing.join(", ")}`);
    process.exit(1);
  }

  const appCss = await readFile(appCssPath, "utf8");
  await mkdir(outDir, { recursive: true });
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const t of targets) {
      const context = await browser.newContext({
        viewport: t.viewport,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(buildStoryUrl(baseUrl, t.storyId), {
        waitUntil: "networkidle",
      });
      await page.locator("#storybook-root > *").first().waitFor();
      // play function の完了待ち（完了シグナルが無いため短い待機）
      await page.waitForTimeout(1500);
      await page.addStyleTag({ content: appCss });
      if (t.theme) {
        await page.evaluate(
          (theme) => document.documentElement.setAttribute("data-theme", theme),
          t.theme,
        );
        await page.waitForTimeout(300);
      }
      for (const name of t.clickButtons ?? []) {
        await page.getByRole("button", { name, exact: true }).click();
        await page.waitForTimeout(300);
      }
      await normalizePage(page);
      const path = join(outDir, `${t.file}.png`);
      const clip = await resolveClip(page, t.clip);
      await page.screenshot(clip ? { path, clip } : { path });
      console.log(`撮影: ${t.file}.png <- ${t.storyId}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

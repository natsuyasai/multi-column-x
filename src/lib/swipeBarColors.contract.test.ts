// Android のスワイプバー（SwipeBarOverlayView.kt）に複製した配色が index.css のトークンと一致することの契約テスト。
// Kotlin 側は WebView の CSS を参照できないため、値のコピーが乖離していないかをここで検査する。
import { describe, expect, it } from "vitest";

// @types/node を入れていないため、型なしの動的 import で fs を読み込む（Vitest は Node 上で動く）
const nodeFs = "node:fs";
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (path: string, encoding: "utf-8") => string;
};
const css = readFileSync("src/index.css", "utf-8");
const kotlin = readFileSync(
  "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/SwipeBarOverlayView.kt",
  "utf-8",
);

type Theme = "dark" | "light";

/** `:root[data-theme="..."] { ... }` ブロックから指定トークンの hex を小文字で取り出す */
function cssToken(theme: Theme, token: string): string {
  const selector = `:root[data-theme="${theme}"]`;
  const start = css.indexOf(selector);
  expect(start, `${selector} が見つからない`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  const match = block.match(
    new RegExp(String.raw`--mcx-${token}:\s*(#[0-9a-fA-F]{6})\s*;`),
  );
  expect(match, `--mcx-${token} が ${theme} に見つからない`).not.toBeNull();
  return (match as RegExpMatchArray)[1].toLowerCase();
}

/** Kotlin の `<name> = Color.parseColor("#xxxxxx")` から hex を小文字で取り出す */
function kotlinColor(name: string): string {
  const match = kotlin.match(
    new RegExp(
      String.raw`\b${name}\s*=\s*Color\.parseColor\("(#[0-9a-fA-F]{6})"\)`,
    ),
  );
  expect(match, `Kotlin に ${name} の定義が見つからない`).not.toBeNull();
  return (match as RegExpMatchArray)[1].toLowerCase();
}

const mappings: [kotlinSuffix: string, token: string][] = [
  ["SURFACE_HOVER", "surface-hover"],
  ["BORDER_SUBTLE", "border-subtle"],
  ["TEXT_TERTIARY", "text-tertiary"],
  ["ACCENT", "accent"],
];

describe.each<Theme>(["dark", "light"])(
  "スワイプバーの配色が index.css と一致する契約（%s）",
  (theme) => {
    it.each(mappings)("%s が --mcx-%s と一致する", (kotlinSuffix, token) => {
      const name = `${theme.toUpperCase()}_${kotlinSuffix}`;
      expect(kotlinColor(name)).toBe(cssToken(theme, token));
    });
  },
);

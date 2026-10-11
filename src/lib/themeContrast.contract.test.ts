// index.css の配色トークンが WCAG のコントラスト基準を満たすことの契約テスト。
// 文字・アイコンは 4.5:1、UI 部品の輪郭は 3:1 以上を要求する。
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

// @types/node を入れていないため、型なしの動的 import で fs を読み込む（Vitest は Node 上で動く）
const nodeFs = "node:fs";
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (path: string, encoding: "utf-8") => string;
};
const css = readFileSync("src/index.css", "utf-8");

type Theme = "dark" | "light";
type Tokens = Record<string, string>;

/** `:root[data-theme="..."] { ... }` ブロックから `--mcx-*: #hex;` を抽出する（rgba 等はスキップ） */
function extractTokens(theme: Theme): Tokens {
  const selector = `:root[data-theme="${theme}"]`;
  const start = css.indexOf(selector);
  expect(start, `${selector} が見つからない`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  const tokens: Tokens = {};
  for (const m of block.matchAll(
    /--mcx-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g,
  )) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

const themes: Record<Theme, Tokens> = {
  dark: extractTokens("dark"),
  light: extractTokens("light"),
};
const themeNames = Object.keys(themes) as Theme[];

const BACKGROUNDS = [
  "app-bg",
  "surface",
  "surface-sunken",
  "surface-muted",
  "surface-hover",
];

/** トークンが無ければ無音でスキップせず失敗させる */
function need(tokens: Tokens, name: string): string {
  const value = tokens[name];
  expect(value, `--mcx-${name} が見つからない`).toBeDefined();
  return value;
}

/** 条件を満たさない組み合わせを列挙して一括で失敗させる */
function expectMinContrast(
  tokens: Tokens,
  pairs: [fg: string, bg: string][],
  min: number,
) {
  const failures = pairs
    .map(([fg, bg]) => ({
      label: `${fg} on ${bg}`,
      ratio: contrastRatio(need(tokens, fg), need(tokens, bg)),
    }))
    .filter(({ ratio }) => ratio < min)
    .map(({ label, ratio }) => `${label}=${ratio.toFixed(2)}`);
  expect(failures, `${min}:1 未満の組み合わせ`).toEqual([]);
}

const cross = (fgs: string[], bgs: string[]) =>
  fgs.flatMap((fg) => bgs.map((bg): [string, string] => [fg, bg]));

describe.each(themeNames)("配色トークンのコントラスト契約（%s）", (theme) => {
  const tokens = themes[theme];

  it("文字・アイコン系トークンが全背景で4.5対1以上である", () => {
    expectMinContrast(
      tokens,
      cross(
        [
          "text",
          "text-secondary",
          "text-tertiary",
          "text-muted",
          "accent",
          "danger",
          "warning",
        ],
        BACKGROUNDS,
      ),
      4.5,
    );
  });

  it("塗りボタンの白文字がaccent-fillとaccent-hoverの上で4.5対1以上である", () => {
    expectMinContrast(
      tokens,
      [
        ["text-on-accent", "accent-fill"],
        ["text-on-accent", "accent-hover"],
      ],
      4.5,
    );
  });

  it("border-strongが主要な面に対して3対1以上である", () => {
    expectMinContrast(
      tokens,
      cross(["border-strong"], ["surface", "surface-sunken", "surface-muted"]),
      3,
    );
  });

  it("状態色の文字が対応する状態背景の上で4.5対1以上である", () => {
    expectMinContrast(
      tokens,
      [
        ["accent", "accent-bg"],
        ["accent", "accent-bg-strong"],
        ["danger", "danger-bg"],
        ["warning", "warning-bg"],
      ],
      4.5,
    );
  });

  it("text-secondary、text-tertiary、text-mutedの順にコントラストが下がる", () => {
    for (const bg of BACKGROUNDS) {
      const bgColor = need(tokens, bg);
      const secondary = contrastRatio(need(tokens, "text-secondary"), bgColor);
      const tertiary = contrastRatio(need(tokens, "text-tertiary"), bgColor);
      const muted = contrastRatio(need(tokens, "text-muted"), bgColor);
      expect(secondary, `${bg}: secondary > tertiary`).toBeGreaterThan(
        tertiary,
      );
      expect(tertiary, `${bg}: tertiary > muted`).toBeGreaterThan(muted);
    }
  });
});

describe("配色トークンのテーマ間整合", () => {
  it("ダークとライトのトークンキー集合が同一である", () => {
    expect(Object.keys(themes.light).sort()).toEqual(
      Object.keys(themes.dark).sort(),
    );
  });
});

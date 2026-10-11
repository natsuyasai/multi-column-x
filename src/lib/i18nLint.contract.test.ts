import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const SCREEN_FILE = "src/components/Sample/Sample.tsx";
// ESLint の初回起動は設定読み込みで遅いため余裕を持たせる
const TIMEOUT = 60_000;

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ overrideConfigFile: "eslint.config.js" });
});

/** 指定パスのコードを lint し、日本語直書き検出ルールの警告だけを返す */
async function lintWarnings(code: string, filePath = SCREEN_FILE) {
  const results = await eslint.lintText(code, { filePath, warnIgnored: false });
  return results
    .flatMap((r) => r.messages)
    .filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("画面の文言に日本語を直接書いた箇所がlintで検出される", () => {
  it.each([
    ["JSXText", `export const A = () => <p>保存する</p>;`],
    ["文字列リテラル", `export const label = "保存する";`],
    [
      "テンプレートリテラル",
      "export const label = (n: number) => `${n}件の保存`;",
    ],
    [
      "JSX属性の文字列",
      `export const A = () => <button aria-label="保存する" />;`,
    ],
  ])(
    "%s の日本語は警告(severity=1)として報告される",
    async (_name, code) => {
      const warnings = await lintWarnings(code);

      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.every((m) => m.severity === 1)).toBe(true);
      expect(warnings[0].message).toBe(
        "画面の文言は辞書（t()）を経由してください",
      );
    },
    TIMEOUT,
  );
});

describe("辞書を経由して表示する文言はlintで検出されない", () => {
  it(
    "辞書のキー経由で表示するコードは警告0である",
    async () => {
      const code = `
        declare function t(key: string): string;
        export const A = () => <p>{t("common:language.auto")}</p>;
      `;

      expect(await lintWarnings(code)).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "コメント内の日本語は警告0である",
    async () => {
      const code = `
        // 保存ボタン
        /* 日本語のコメント */
        export const value = 1;
      `;

      expect(await lintWarnings(code)).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "英語のみの文字列は警告0である",
    async () => {
      const code = `export const label = "Save";
export const A = () => <p>Save</p>;`;

      expect(await lintWarnings(code)).toEqual([]);
    },
    TIMEOUT,
  );

  it.each([
    ["テストファイル", "src/components/Sample/Sample.test.tsx"],
    ["Storyファイル", "src/components/Sample/Sample.stories.tsx"],
    ["辞書ディレクトリ", "src/locales/ja/sample.ts"],
    ["i18nディレクトリ", "src/i18n/sample.ts"],
  ])(
    "%s では日本語を書いても警告0である",
    async (_name, filePath) => {
      const code = `export const label = "保存する";`;

      expect(await lintWarnings(code, filePath)).toEqual([]);
    },
    TIMEOUT,
  );
});

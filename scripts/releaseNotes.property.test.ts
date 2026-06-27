import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildReleaseBody,
  categorize,
  extractReleaseNotesSection,
} from "./releaseNotes.mjs";

// ---------------------------------------------------------------
// 共通 Arbitrary
// ---------------------------------------------------------------

/**
 * 安全な項目テキスト: 改行・CR を含まず、先頭がマーカー文字（#/-/*）・空白でなく、
 * 前後に余分な空白がない非空文字列。
 * extractReleaseNotesSection が trim() を適用しても値が変化しない性質を満たす。
 */
const safeItemArb = fc
  .string({ minLength: 1 })
  .filter(
    (s) =>
      !s.includes("\n") &&
      !s.includes("\r") &&
      !/^[#\-*]/.test(s) &&
      s === s.trim(),
  );

/** items 配列から "## リリースノート\n- item\n- item..." 形式の本文を構築する */
function makeBodyWithSection(items: string[]): string {
  return `## リリースノート\n${items.map((i) => `- ${i}`).join("\n")}`;
}

/** リリースノートセクション付き PR を生成する arbitrary */
const prWithSectionArb = fc.record({
  title: fc.string(),
  body: fc.array(safeItemArb, { minLength: 1 }).map(makeBodyWithSection),
  labels: fc.array(fc.string()),
});

// ---------------------------------------------------------------
// プロパティテスト
// ---------------------------------------------------------------

describe("releaseNotes プロパティテスト", () => {
  it("categorize は任意の title/labels に対して必ず 'feature' | 'improvement' | 'fix' のいずれかを返す", () => {
    const validCategories = new Set<string>(["feature", "improvement", "fix"]);
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string()), (title, labels) => {
        const result = categorize({ title, labels });
        expect(validCategories.has(result)).toBe(true);
      }),
    );
  });

  it("extractReleaseNotesSection はマーカーを除去しtrim済みで生成した項目列と完全一致する", () => {
    fc.assert(
      fc.property(fc.array(safeItemArb, { minLength: 1 }), (items) => {
        const body = makeBodyWithSection(items);
        const extracted = extractReleaseNotesSection(body);
        expect(extracted).toEqual(items);
      }),
    );
  });

  it("リリースノートセクションを持たない PR 配列では buildReleaseBody は空文字列を返す", () => {
    // セクション見出し文字列（リリースノート）を含まない本文 arbitrary
    const noSectionBodyArb = fc.oneof(
      fc.constant(null as null),
      fc.constant(undefined as undefined),
      fc.constant(""),
      // 別の見出しセクションを持つ本文（リリースノートではない）
      fc.constantFrom(
        "## 変更点\n- 関係ない",
        "# 概要\n- 何か",
        "## Release Notes\n- english only",
        "通常のPR説明文",
      ),
      // 任意文字列（リリースノートを含むものを排除）
      fc.string().filter((s) => !s.includes("リリースノート")),
    );

    const noSectionPrArb = fc.record({
      title: fc.string(),
      body: noSectionBodyArb,
      labels: fc.array(fc.string()),
    });

    fc.assert(
      fc.property(fc.array(noSectionPrArb), (prs) => {
        expect(buildReleaseBody(prs)).toBe("");
      }),
    );
  });

  it("セクション付き PR 配列の各項目テキストは buildReleaseBody の出力に部分文字列として含まれる", () => {
    fc.assert(
      fc.property(fc.array(prWithSectionArb, { minLength: 1 }), (prs) => {
        const output = buildReleaseBody(prs);
        for (const pr of prs) {
          const items = extractReleaseNotesSection(pr.body);
          for (const item of items) {
            expect(output).toContain(item);
          }
        }
      }),
    );
  });

  it("カテゴリ見出しが複数現れる場合は '新機能' → '改善' → '不具合修正' の順になる", () => {
    const bodyWithSectionArb = fc
      .array(safeItemArb, { minLength: 1 })
      .map(makeBodyWithSection);

    // カテゴリを制御するため title 接頭辞で feat / fix / chore を指定
    const categorizedPrArb = fc.record({
      title: fc.oneof(
        fc.constant("feat: 機能追加"),
        fc.constant("fix: バグ修正"),
        fc.constant("chore: 整理"),
      ),
      body: bodyWithSectionArb,
      labels: fc.array(fc.string()),
    });

    fc.assert(
      fc.property(fc.array(categorizedPrArb, { minLength: 1 }), (prs) => {
        const output = buildReleaseBody(prs);
        if (output === "") return; // 全 PR にセクションがなければスキップ

        const headings = ["### 新機能", "### 改善", "### 不具合修正"];
        // 出現位置（-1 = 不在）を順番通りに並べ、存在するもののみを抽出
        const positions = headings
          .map((h) => output.indexOf(h))
          .filter((idx) => idx !== -1);

        // 存在するカテゴリ見出しの位置は単調増加であること
        for (let i = 0; i < positions.length - 1; i++) {
          expect(positions[i]).toBeLessThan(positions[i + 1]);
        }
      }),
    );
  });

  it("buildReleaseBody の非空出力は末尾に改行を持たない", () => {
    fc.assert(
      fc.property(fc.array(prWithSectionArb, { minLength: 1 }), (prs) => {
        const output = buildReleaseBody(prs);
        if (output !== "") {
          expect(output).not.toMatch(/\n$/);
        }
      }),
    );
  });
});

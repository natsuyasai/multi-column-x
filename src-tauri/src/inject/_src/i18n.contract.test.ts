// inject スクリプトの画面文言が辞書（i18n.ts）経由になっていることを検証する契約テスト。
// _src の非テストファイルにある日本語リテラルは、許可リストに載ったものだけを許す。
// 許可リストは「X の画面（DOM）と照合するために日本語のまま持つ必要がある値」だけで構成し、
// ユーザーに見せる文言は必ず i18n.ts の辞書へ移す。
import { describe, it, expect } from "vitest";

const JAPANESE = /[぀-ヿ一-鿿]/;

interface AllowedLiteral {
  file: string;
  /** 許可する行（コメント除去後）に一致するパターン */
  pattern: RegExp;
  reason: string;
}

const ALLOWED_LITERALS: AllowedLiteral[] = [
  {
    file: "hide_ad.ts",
    pattern: /AD_TEXTS = \[.*"広告".*\]/,
    reason: "X の広告ラベルのテキストと照合する値（表示文言ではない）",
  },
  {
    file: "return_to_last_read_logic.ts",
    pattern: /AD_TEXTS = \[.*"広告".*\]/,
    reason: "X の広告ラベルのテキストと照合する値（表示文言ではない）",
  },
  {
    file: "notification_header_hide.ts",
    pattern: /nav\[aria-label="通知タイムライン"\]/,
    reason: "X の通知タイムラインの aria-label と照合するセレクタ",
  },
  {
    file: "headerCustomizerTypes.ts",
    pattern: /^\s*[^\s":]+: \{$/,
    reason:
      "DEFAULT_NAV_LINKS のキー。X の DOM の aria-label（日本語UI）と照合する値",
  },
  {
    file: "headerCustomizerTypes.ts",
    pattern: /^\s*ariaLabel: "[^"]+",$/,
    reason: "X の DOM の aria-label と照合する値。表示名は label（翻訳対象）",
  },
];

const sources = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function isTarget(path: string): boolean {
  const name = path.replace("./", "");
  if (name === "i18n.ts") return false;
  if (/\.test\.tsx?$/.test(name) || /\.property\.test\.tsx?$/.test(name)) {
    return false;
  }
  return true;
}

/** コメント（// /* *\/ JSX の {/* *\/}）を空白に置き換える。行番号は変えない。 */
function stripComments(source: string): string[] {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  return withoutBlocks.split("\n").map((line) => {
    // 行末・行頭の // コメント（"https://" のような文字列中の // は直前が空白でないので残す）
    return line.replace(/(^|\s)\/\/.*$/, "$1");
  });
}

interface Violation {
  location: string;
  line: string;
}

function findLiterals(): {
  violations: Violation[];
  used: Set<AllowedLiteral>;
} {
  const violations: Violation[] = [];
  const used = new Set<AllowedLiteral>();
  for (const [path, source] of Object.entries(sources)) {
    if (!isTarget(path)) continue;
    const file = path.replace("./", "");
    stripComments(source).forEach((line, index) => {
      if (!JAPANESE.test(line)) return;
      const allowed = ALLOWED_LITERALS.find(
        (entry) => entry.file === file && entry.pattern.test(line),
      );
      if (allowed) {
        used.add(allowed);
        return;
      }
      violations.push({
        location: `${file}:${index + 1}`,
        line: line.trim(),
      });
    });
  }
  return { violations, used };
}

describe("inject スクリプトの日本語リテラルの契約", () => {
  it("走査対象に画面文言を持つスクリプトが含まれている", () => {
    const targets = Object.keys(sources)
      .filter(isTarget)
      .map((p) => p.replace("./", ""));

    expect(targets).toEqual(
      expect.arrayContaining([
        "context_menu.ts",
        "popup_toolbar.ts",
        "return_to_last_read.ts",
        "video_long_press_menu.ts",
        "HeaderCustomizer.tsx",
        "useHeaderCustomizer.ts",
        "headerCustomizerTypes.ts",
      ]),
    );
    expect(targets).not.toContain("i18n.ts");
    expect(targets.some((name) => name.includes(".test."))).toBe(false);
  });

  it("注入スクリプトに日本語の画面文言が直書きされていない（許可リスト以外の日本語リテラルが無い）", () => {
    const { violations } = findLiterals();

    expect(
      violations.map((v) => `${v.location}: ${v.line}`),
      "画面文言は i18n.ts の辞書へ移し window.__mcxI18n 経由にすること。X の画面と照合する値だけを許可リストへ理由付きで追加する",
    ).toEqual([]);
  });

  it("許可リストの各項目が実際に使われている（不要な許可が残っていない）", () => {
    const { used } = findLiterals();

    const unused = ALLOWED_LITERALS.filter((entry) => !used.has(entry)).map(
      (entry) => `${entry.file}: ${entry.pattern}`,
    );
    expect(unused).toEqual([]);
  });

  it("コメント内の日本語は走査対象にならない", () => {
    const lines = stripComments(
      [
        "// 行コメントの日本語",
        "const a = 1; // 行末コメントの日本語",
        "/* ブロック",
        " * コメントの日本語 */",
        "{/* JSXコメントの日本語 */}",
        'const url = "https://example.com";',
      ].join("\n"),
    );

    expect(lines.some((line) => JAPANESE.test(line))).toBe(false);
    expect(lines).toHaveLength(6);
    expect(lines[5]).toContain("https://example.com");
  });

  it("コード中の日本語リテラルは走査対象になる", () => {
    const lines = stripComments('const label = "日本語"; // コメント');

    expect(lines.some((line) => JAPANESE.test(line))).toBe(true);
  });
});

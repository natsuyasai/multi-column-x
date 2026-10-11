import { describe, expect, it } from "vitest";
import { resources } from "@/i18n/resources";

type Dict = { [key: string]: string | Dict };

const rawSources = import.meta.glob("/src-tauri/src/commands/app_error.rs", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SOURCE = rawSources["/src-tauri/src/commands/app_error.rs"];

/** `pub const X: &str = "code";` から Rust のエラーコードを全て抽出する */
function extractCodes(source: string): string[] {
  return [...source.matchAll(/pub const [A-Z0-9_]+: &str = "([^"]+)";/g)].map(
    (m) => m[1],
  );
}

/** `rustError` 辞書をドット区切りのコード（`unknown` 系を除く）に平坦化する */
function dictionaryCodes(dict: Dict): string[] {
  const result: string[] = [];
  const walk = (node: Dict, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") result.push(path);
      else walk(value, path);
    }
  };
  walk(dict, "");
  return result.filter((c) => c !== "unknown" && c !== "unknownWithDetail");
}

describe("コード抽出ロジック", () => {
  it("pub const の文字列定数からコードを抽出する", () => {
    expect(
      extractCodes(
        `pub const A_B: &str = "extension.notFound";\npub const C: &str = "file.x";\nconst D: &str = "private.skip";`,
      ),
    ).toEqual(["extension.notFound", "file.x"]);
  });
});

describe("Rustのエラーコードと辞書の対応", () => {
  const codes = extractCodes(SOURCE);

  it("app_error.rs を読み込めている", () => {
    expect(SOURCE).toContain("pub struct AppError");
  });

  it("コードは領域.camelCase名のASCIIである", () => {
    for (const code of codes) {
      expect(code).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/);
    }
  });

  it.each(["ja", "en"] as const)(
    "全てのコードが %s 辞書の rustError に存在する",
    (lang) => {
      const messages = resources[lang].messages as unknown as Dict;
      const available = new Set(dictionaryCodes(messages.rustError as Dict));

      const missing = codes.filter((c) => !available.has(c));

      expect(missing, `辞書に無いコード:\n${missing.join("\n")}`).toEqual([]);
    },
  );

  it.each(["ja", "en"] as const)(
    "%s 辞書の rustError に対応するコードの無い余剰キーが無い",
    (lang) => {
      const messages = resources[lang].messages as unknown as Dict;
      const known = new Set(codes);

      const extra = dictionaryCodes(messages.rustError as Dict).filter(
        (c) => !known.has(c),
      );

      expect(extra, `余剰キー:\n${extra.join("\n")}`).toEqual([]);
    },
  );
});

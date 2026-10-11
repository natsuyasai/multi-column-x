import { describe, expect, it } from "vitest";
import { resources } from "./resources";

type Dict = { [key: string]: string | Dict };

/** 辞書を再帰的にたどり、キーパス（ドット区切り）と訳文の組を列挙する */
function flatten(dict: Dict, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[path] = value;
    } else {
      Object.assign(result, flatten(value, path));
    }
  }
  return result;
}

function interpolationNames(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g)]
    .map((m) => m[1])
    .sort();
}

const namespaces = Object.keys(resources.ja) as (keyof typeof resources.ja)[];

describe("辞書の整合性", () => {
  it.each(namespaces)(
    "日本語と英語の辞書のキー集合が一致している（%s）",
    (ns) => {
      const ja = Object.keys(flatten(resources.ja[ns] as Dict)).sort();
      const en = Object.keys(flatten(resources.en[ns] as Dict)).sort();

      expect(en).toEqual(ja);
    },
  );

  it("日本語と英語で名前空間の集合が一致している", () => {
    expect(Object.keys(resources.en).sort()).toEqual(
      Object.keys(resources.ja).sort(),
    );
    for (const ns of namespaces) {
      expect(ns in resources.en).toBe(true);
    }
  });

  it.each(namespaces)(
    "日本語と英語の辞書で補間変数の名前が一致している（%s）",
    (ns) => {
      const ja = flatten(resources.ja[ns] as Dict);
      const en = flatten(resources.en[ns] as Dict);

      for (const [key, text] of Object.entries(ja)) {
        expect(interpolationNames(en[key] ?? ""), key).toEqual(
          interpolationNames(text),
        );
      }
    },
  );
});

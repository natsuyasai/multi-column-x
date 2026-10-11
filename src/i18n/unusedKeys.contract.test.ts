import { describe, expect, it } from "vitest";
import { resources } from "./resources";

type Dict = { [key: string]: string | Dict };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

interface CollectedKeys {
  staticKeys: Set<string>;
  dynamicPrefixes: Set<string>;
}

/** ソース文字列から翻訳キー（静的キーと動的キーの接頭辞）を収集する */
function collectKeys(source: string): CollectedKeys {
  const staticKeys = new Set<string>();
  const dynamicPrefixes = new Set<string>();

  // t("ns:a.b") / i18n.t('ns:a.b') / i18nKey="ns:a.b"
  const quoted = [
    /\bt\(\s*(["'])([a-zA-Z]+:[^"'`$\\]+)\1/g,
    /\bi18nKey=\{?\s*(["'])([a-zA-Z]+:[^"'`$\\]+)\1/g,
  ];
  for (const pattern of quoted) {
    for (const match of source.matchAll(pattern)) {
      staticKeys.add(match[2]);
    }
  }
  // 補間なしのテンプレートリテラル t(`ns:a.b`)
  for (const match of source.matchAll(/\bt\(\s*`([a-zA-Z]+:[^`$\\]+)`/g)) {
    staticKeys.add(match[1]);
  }
  // 動的キー t(`ns:prefix.${v}`) は接頭辞として収集
  for (const match of source.matchAll(/\bt\(\s*`([a-zA-Z]+:[^`$\\]*)\$\{/g)) {
    dynamicPrefixes.add(match[1]);
  }
  return { staticKeys, dynamicPrefixes };
}

/** ja 辞書の全キーを `ns:a.b.c` 形式（複数形接尾辞なし）で列挙する */
function listDictionaryKeys(): string[] {
  const keys = new Set<string>();
  const walk = (dict: Dict, path: string, ns: string) => {
    for (const [key, value] of Object.entries(dict)) {
      const next = path ? `${path}.${key}` : key;
      if (typeof value === "string") {
        keys.add(`${ns}:${next.replace(PLURAL_SUFFIX, "")}`);
      } else {
        walk(value, next, ns);
      }
    }
  };
  for (const [ns, dict] of Object.entries(resources.ja)) {
    walk(dict as Dict, "", ns);
  }
  return [...keys].sort();
}

// テスト・Story・プロパティテスト・契約テスト・辞書・i18n 基盤・テスト補助は走査対象外
const sources = import.meta.glob(
  [
    "/src/**/*.{ts,tsx}",
    "!/src/**/*.{test,stories,property,contract}.{ts,tsx}",
    "!/src/locales/**",
    "!/src/i18n/**",
    "!/src/test-utils/**",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

describe("キー収集ロジック", () => {
  it("t と i18n.t の静的キーを収集する", () => {
    const { staticKeys } = collectKeys(
      `t("settings:a.b"); i18n.t('common:x.y'); t( "dialogs:z" )`,
    );

    expect([...staticKeys].sort()).toEqual([
      "common:x.y",
      "dialogs:z",
      "settings:a.b",
    ]);
  });

  it("i18nKey 属性のキーを収集する", () => {
    const { staticKeys } = collectKeys(
      `<Trans i18nKey="dialogs:update.body" /><Trans i18nKey={"dialogs:other"} />`,
    );

    expect([...staticKeys].sort()).toEqual([
      "dialogs:other",
      "dialogs:update.body",
    ]);
  });

  it("補間なしのテンプレートリテラルは静的キーとして収集する", () => {
    const { staticKeys, dynamicPrefixes } = collectKeys("t(`common:a.b`)");

    expect([...staticKeys]).toEqual(["common:a.b"]);
    expect(dynamicPrefixes.size).toBe(0);
  });

  it("補間を含むテンプレートリテラルは接頭辞として収集する", () => {
    const { staticKeys, dynamicPrefixes } = collectKeys(
      "{t(`common:language.${value}`)}",
    );

    expect(staticKeys.size).toBe(0);
    expect([...dynamicPrefixes]).toEqual(["common:language."]);
  });

  it("名前空間のない文字列や t 以外の関数呼び出しは収集しない", () => {
    const { staticKeys, dynamicPrefixes } = collectKeys(
      `format("a:b"); split("x"); t("noNamespace")`,
    );

    expect(staticKeys.size).toBe(0);
    expect(dynamicPrefixes.size).toBe(0);
  });

  it("実際のコンポーネントの t 呼び出しを検出できる", () => {
    const source =
      sources["/src/components/AppSettingsPanel/DisplaySettingsSection.tsx"];

    const { staticKeys, dynamicPrefixes } = collectKeys(source);

    expect(staticKeys.has("settings:language.label")).toBe(true);
    expect(dynamicPrefixes.has("common:language.")).toBe(true);
  });
});

describe("辞書キーの使用状況", () => {
  it("ja 辞書の全キーがソース内で参照されている", () => {
    const staticKeys = new Set<string>();
    const dynamicPrefixes = new Set<string>();
    for (const source of Object.values(sources)) {
      const collected = collectKeys(source);
      collected.staticKeys.forEach((k) => staticKeys.add(k));
      collected.dynamicPrefixes.forEach((p) => dynamicPrefixes.add(p));
    }

    const unused = listDictionaryKeys().filter(
      (key) =>
        !staticKeys.has(key) &&
        ![...dynamicPrefixes].some((prefix) => key.startsWith(prefix)),
    );

    expect(unused, `未使用の辞書キー:\n${unused.join("\n")}`).toEqual([]);
  });
});

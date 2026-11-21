// @types/node を入れていないため、型なしの動的 import で fs を読み込む（Vitest は Node 上で動く）
const nodeFs = "node:fs";
const { readFileSync, readdirSync } = (await import(
  /* @vite-ignore */ nodeFs
)) as {
  readFileSync: (path: string, encoding: "utf-8") => string;
  readdirSync: (
    path: string,
    options: { withFileTypes: true },
  ) => { name: string; isDirectory: () => boolean }[];
};

export interface ScssDeclaration {
  prop: string;
  value: string;
}

export interface ScssBlock {
  selector: string;
  declarations: ScssDeclaration[];
  includes: string[];
  isAndroid: boolean;
  file: string;
}

/** `{` に対応する `}` の位置を返す */
function findClosingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** ブロックを開く `{` の位置を返す。`#{...}` 補間の `{` は除く */
function findBlockOpen(source: string, from: number): number {
  for (let i = from; i < source.length; i++) {
    if (source[i] === "{" && source[i - 1] !== "#") return i;
  }
  return -1;
}

function resolveSelector(raw: string, parent: string): string {
  const selector = raw.replace(/\s+/g, " ").trim();
  const keyframes = /^@keyframes\s+([\w-]+)/.exec(selector);
  if (keyframes) return `@keyframes ${keyframes[1]}`;
  // @keyframes 内の from / to / 50% は @keyframes 名のまま扱う
  if (parent.startsWith("@keyframes ")) return parent;
  const mixin = /^@mixin\s+([\w-]+)/.exec(selector);
  if (mixin) return `@mixin ${mixin[1]}`;
  // @media などの at-rule は親セレクタを引き継ぐ
  if (selector.startsWith("@")) return parent;
  if (parent === "") return selector;
  if (selector.includes("&")) return selector.split("&").join(parent);
  return `${parent} ${selector}`;
}

function parseDeclaration(statement: string): ScssDeclaration {
  const index = statement.indexOf(":");
  return {
    prop: statement.slice(0, index).trim(),
    value: statement
      .slice(index + 1)
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function parseBody(
  body: string,
  parent: string,
  file: string,
  out: ScssBlock[],
): void {
  const block: ScssBlock = {
    selector: parent,
    declarations: [],
    includes: [],
    isAndroid: /data-platform=.android./.test(parent),
    file,
  };
  const children: ScssBlock[] = [];
  out.push(block);

  let cursor = 0;
  while (cursor < body.length) {
    const nextBrace = findBlockOpen(body, cursor);
    const nextSemicolon = body.indexOf(";", cursor);
    const isBlock =
      nextBrace !== -1 && (nextSemicolon === -1 || nextBrace < nextSemicolon);
    if (isBlock) {
      const end = findClosingBrace(body, nextBrace);
      const selector = resolveSelector(body.slice(cursor, nextBrace), parent);
      parseBody(body.slice(nextBrace + 1, end), selector, file, children);
      cursor = end + 1;
      continue;
    }
    const end = nextSemicolon === -1 ? body.length : nextSemicolon;
    const statement = body.slice(cursor, end).trim();
    if (statement.startsWith("@include ")) {
      block.includes.push(statement.slice("@include ".length).trim());
    } else if (
      statement !== "" &&
      !statement.startsWith("$") &&
      !statement.startsWith("@")
    ) {
      block.declarations.push(parseDeclaration(statement));
    }
    cursor = end + 1;
  }
  out.push(...children);
}

export function parseScss(source: string, file = ""): ScssBlock[] {
  const root: ScssBlock[] = [];
  parseBody(stripScssComments(source), "", file, root);
  // ルート（セレクタなし）のブロックは宣言を持たない限り返さない
  return root.filter((b) => b.selector !== "");
}

/** 引用符で始まる文字列リテラルの終端（閉じ引用符の次の位置）を返す */
function findStringEnd(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === quote) return i + 1;
  }
  return source.length;
}

/** コメントを除去する。文字列リテラルと url(...) の中身は壊さない */
export function stripScssComments(source: string): string {
  let result = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const end = findStringEnd(source, i);
      result += source.slice(i, end);
      i = end;
    } else if (source.slice(i, i + 4).toLowerCase() === "url(") {
      const close = source.indexOf(")", i);
      const end = close === -1 ? source.length : close + 1;
      result += source.slice(i, end);
      i = end;
    } else if (source.startsWith("/*", i)) {
      const close = source.indexOf("*/", i + 2);
      i = close === -1 ? source.length : close + 2;
    } else if (source.startsWith("//", i)) {
      const newline = source.indexOf("\n", i);
      i = newline === -1 ? source.length : newline;
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

/** src 配下の *.module.scss を相対パス（"src/…"）で昇順に列挙する */
export function listModuleScssFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".module.scss")) found.push(path);
    }
  };
  walk("src");
  return found.sort();
}

export function readScss(path: string): string {
  return readFileSync(path, "utf-8");
}

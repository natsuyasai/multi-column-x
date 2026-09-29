// src/lib/lineListValidation.ts
// 行リスト入力（NGワード / ホワイトリスト / リポスト非表示ユーザー）の
// parse・validate（Tauri 非依存の純粋関数）。

import { validateNgWordLines } from "./ngWordPattern";
import { parseUserIdLines, validateUserIdLine } from "./repostHiddenUserId";

export type LineListParseResult =
  | { kind: "valid"; values: string[] }
  | { kind: "invalid"; error: string };

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/** NGワード / ホワイトリスト形式（1行1ワード・/正規表現/flags 可）の入力を解析・検証する。 */
export function parseAndValidateWordLines(text: string): LineListParseResult {
  const values = splitLines(text);
  const error = validateNgWordLines(values);
  return error ? { kind: "invalid", error } : { kind: "valid", values };
}

/** リポスト非表示ユーザー（1行1ID）の入力を解析・検証する。最初の不正行のエラーを返す。 */
export function parseAndValidateUserIdLines(text: string): LineListParseResult {
  const values = parseUserIdLines(text);
  const error =
    values.map((id) => validateUserIdLine(id)).find((e) => e !== null) ?? null;
  return error ? { kind: "invalid", error } : { kind: "valid", values };
}

// src/components/SettingsPanel/lineListInputs.ts
// SettingsPanel の行リスト入力（NGワード / リポスト非表示ユーザー / ホワイトリスト）の
// parse・validate をまとめた純粋関数（Tauri 非依存）。

import { validateNgWordLines } from "@/lib/ngWordPattern";
import { parseUserIdLines, validateUserIdLine } from "@/lib/repostHiddenUserId";

export type LineListField =
  | "ngWords"
  | "repostHiddenUserIds"
  | "whitelistWords";

export type LineListErrors = Record<LineListField, string | null>;

export type LineListTexts = Record<LineListField, string>;

export type LineListValidation =
  | { kind: "valid"; values: Record<LineListField, string[]> }
  | { kind: "invalid"; field: LineListField; error: string };

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

export function validateLineListInputs(
  texts: LineListTexts,
): LineListValidation {
  const ngWords = splitLines(texts.ngWords);
  const ngWordsError = validateNgWordLines(ngWords);
  if (ngWordsError) {
    return { kind: "invalid", field: "ngWords", error: ngWordsError };
  }

  const repostHiddenUserIds = parseUserIdLines(texts.repostHiddenUserIds);
  const repostHiddenUserIdsError =
    repostHiddenUserIds
      .map((id) => validateUserIdLine(id))
      .find((error) => error !== null) ?? null;
  if (repostHiddenUserIdsError) {
    return {
      kind: "invalid",
      field: "repostHiddenUserIds",
      error: repostHiddenUserIdsError,
    };
  }

  const whitelistWords = splitLines(texts.whitelistWords);
  const whitelistWordsError = validateNgWordLines(whitelistWords);
  if (whitelistWordsError) {
    return {
      kind: "invalid",
      field: "whitelistWords",
      error: whitelistWordsError,
    };
  }

  const values: Record<LineListField, string[]> = {
    ngWords,
    repostHiddenUserIds,
    whitelistWords,
  };

  return { kind: "valid", values };
}

const LINE_LIST_FIELD_ORDER: LineListField[] = [
  "ngWords",
  "repostHiddenUserIds",
  "whitelistWords",
];

export function nextLineListErrors(
  prev: LineListErrors,
  result: LineListValidation,
): LineListErrors {
  if (result.kind === "valid") {
    return { ngWords: null, repostHiddenUserIds: null, whitelistWords: null };
  }

  const failedIndex = LINE_LIST_FIELD_ORDER.indexOf(result.field);
  const next = { ...prev };
  LINE_LIST_FIELD_ORDER.forEach((field, index) => {
    if (index < failedIndex) {
      next[field] = null;
    } else if (index === failedIndex) {
      next[field] = result.error;
    }
  });
  return next;
}

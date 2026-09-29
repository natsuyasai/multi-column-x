// src/components/SettingsPanel/lineListInputs.ts
// SettingsPanel の行リスト入力（NGワード / リポスト非表示ユーザー / ホワイトリスト）の
// parse・validate をまとめた純粋関数（Tauri 非依存）。

import {
  parseAndValidateUserIdLines,
  parseAndValidateWordLines,
} from "@/lib/lineListValidation";

export type LineListField =
  | "ngWords"
  | "repostHiddenUserIds"
  | "whitelistWords";

export type LineListErrors = Record<LineListField, string | null>;

export type LineListTexts = Record<LineListField, string>;

export type LineListValidation =
  | { kind: "valid"; values: Record<LineListField, string[]> }
  | { kind: "invalid"; field: LineListField; error: string };

export function validateLineListInputs(
  texts: LineListTexts,
): LineListValidation {
  const ngWords = parseAndValidateWordLines(texts.ngWords);
  if (ngWords.kind === "invalid") {
    return { kind: "invalid", field: "ngWords", error: ngWords.error };
  }

  const repostHiddenUserIds = parseAndValidateUserIdLines(
    texts.repostHiddenUserIds,
  );
  if (repostHiddenUserIds.kind === "invalid") {
    return {
      kind: "invalid",
      field: "repostHiddenUserIds",
      error: repostHiddenUserIds.error,
    };
  }

  const whitelistWords = parseAndValidateWordLines(texts.whitelistWords);
  if (whitelistWords.kind === "invalid") {
    return {
      kind: "invalid",
      field: "whitelistWords",
      error: whitelistWords.error,
    };
  }

  const values: Record<LineListField, string[]> = {
    ngWords: ngWords.values,
    repostHiddenUserIds: repostHiddenUserIds.values,
    whitelistWords: whitelistWords.values,
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

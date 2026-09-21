// src/lib/repostHiddenUserId.ts
// リポストを非表示にするユーザーID（1行1ID）の解析・検証（Tauri 非依存の純粋関数）

const USER_ID_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/**
 * textarea の入力（1行1ID）をID配列に変換する。
 * 前後空白と先頭の@を除去し、空行を捨て、大文字小文字を無視して重複を除く（先に書かれた表記を残す）。
 */
export function parseUserIdLines(text: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const id = line.trim().replace(/^@/, "").trim();
    if (id === "") {
      continue;
    }
    const key = id.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ids.push(id);
  }
  return ids;
}

/**
 * ユーザーID1件を検証する（parseUserIdLines 済みの値を受け取る前提）。
 * Xのユーザー名規則（英数字とアンダースコアの1〜15文字）に合致すれば null、違反ならエラーメッセージを返す。
 */
export function validateUserIdLine(id: string): string | null {
  if (USER_ID_PATTERN.test(id)) {
    return null;
  }
  return `\`${id}\` はXのユーザーIDとして正しくありません（英数字とアンダースコアの1〜15文字）`;
}

// src-tauri/src/inject/_src/repost_hide_matcher.ts
// 指定ユーザーがリポストした投稿を非表示にすべきか判定する（DOM非依存の純粋関数）

/**
 * ユーザーIDを比較用に正規化する（前後空白trim → 先頭@を1つ除去 → 小文字化）。
 */
export function normalizeUserId(raw: string): string {
  const trimmed = raw.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return withoutAt.toLowerCase();
}

/**
 * href（相対パス）から単一セグメントのユーザーIDを取り出す。
 * 先頭が "/" でない・空・複数セグメント（/ID/status/1 など）の場合は null。
 * 戻り値は小文字化済み。
 */
export function hrefToUserId(href: string): string | null {
  const path = href.split(/[?#]/)[0];
  if (!path.startsWith("/")) return null;
  const rest = path.slice(1);
  if (rest === "" || rest.includes("/")) return null;
  return rest.toLowerCase();
}

/**
 * socialContext に紐づくリンク群のいずれかが、非表示対象ユーザーIDに一致するか判定する。
 */
export function shouldHideByRepostUser(
  socialContextHrefs: string[],
  hiddenIds: string[],
): boolean {
  const normalizedIds = new Set(
    hiddenIds.map(normalizeUserId).filter((id) => id !== ""),
  );
  if (normalizedIds.size === 0) return false;
  return socialContextHrefs.some((href) => {
    const id = hrefToUserId(href);
    return id !== null && normalizedIds.has(id);
  });
}

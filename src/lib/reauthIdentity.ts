// src/lib/reauthIdentity.ts
// 再認証で得た X ユーザーIDと、登録済みユーザーIDの同一性照合（Tauri 非依存の純粋関数）

export type ReauthIdentityResult = "skip" | "match" | "mismatch";

/**
 * 再認証で得た actualUserId と、登録済み expectedUserId を照合する。
 * - expected が未設定(undefined/null/空文字) → "skip"（初回: 照合せず記録のみ）
 * - expected === actual → "match"
 * - それ以外 → "mismatch"
 */
export function evaluateReauthIdentity(
  expected: string | undefined | null,
  actual: string,
): ReauthIdentityResult {
  if (expected === undefined || expected === null || expected === "") {
    return "skip";
  }
  return expected === actual ? "match" : "mismatch";
}

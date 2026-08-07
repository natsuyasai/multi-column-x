export type RateLimitSeverity = "normal" | "warning" | "critical";

const WARNING_THRESHOLD_RATIO = 0.2; // 20%以下で警告（黄）
const CRITICAL_THRESHOLD_RATIO = 0.05; // 5%未満で危険（赤）

/**
 * remaining/limit の比率から警告レベルを判定する。
 * - limitが0以下（不正値・未取得）の場合は判定不能としてnormal扱い（ゼロ除算回避）
 * - remaining/limit < 5% で "critical"
 * - remaining/limit <= 20% で "warning"
 * - それ以外は "normal"
 */
export function getRateLimitSeverity(
  remaining: number,
  limit: number,
): RateLimitSeverity {
  if (limit <= 0) return "normal";
  const ratio = remaining / limit;
  if (ratio < CRITICAL_THRESHOLD_RATIO) return "critical";
  if (ratio <= WARNING_THRESHOLD_RATIO) return "warning";
  return "normal";
}

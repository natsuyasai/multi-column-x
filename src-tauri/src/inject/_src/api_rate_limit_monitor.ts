// src-tauri/src/inject/_src/api_rate_limit_monitor.ts
//
// X内部API（GraphQL/v1.1）のXHRレスポンスヘッダに含まれる
// x-rate-limit-limit / x-rate-limit-remaining / x-rate-limit-reset を監視し、
// Rust側へ report_api_rate_limit で通知する。
// fetchは使われていないことを実機検証で確認済みのため、XHRのみ対応する（YAGNI）。

// --- 純粋関数（vitest で単体テストする） ---

/**
 * リクエストURLからレート制限バケットの識別子を抽出する。
 * - GraphQLのURL（pathnameのセグメントに "graphql" を含む）は末尾セグメント（OperationName）を返す
 *   例: /i/api/graphql/T1x2zehUOKCWNpKwZCpnbg/UserTweets → "UserTweets"
 * - それ以外（v1.1系など）は末尾2セグメントを "/" 結合して返す
 *   例: /i/api/1.1/flow/viewer.json → "flow/viewer.json"
 * - セグメントが0個、またはURLパースに失敗した場合はnull
 *
 * urlがroot-relativeパス（例: "/i/api/graphql/xxx/UserTweets"）の場合は
 * baseを基準に解決する。baseの既定値は呼び出し時点の `location.href`。
 */
export function extractBucketKey(
  url: string,
  base: string = location.href,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }

  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  if (segments.includes("graphql")) {
    return segments[segments.length - 1];
  }

  if (segments.length === 1) {
    return segments[0];
  }

  return segments.slice(-2).join("/");
}

/**
 * XMLHttpRequest.getAllResponseHeaders() が返す形式（\r\n区切り、"key: value"）から
 * レート制限系ヘッダ3種を抽出し数値化する。
 * いずれかが欠けている、または数値変換できない場合はnull。
 */
export function parseRateLimitHeaders(
  headersRaw: string,
): { limit: number; remaining: number; reset: number } | null {
  const headers = new Map<string, string>();
  for (const line of headersRaw.split("\r\n")) {
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers.set(key, value);
  }

  const limitRaw = headers.get("x-rate-limit-limit");
  const remainingRaw = headers.get("x-rate-limit-remaining");
  const resetRaw = headers.get("x-rate-limit-reset");
  if (
    limitRaw === undefined ||
    remainingRaw === undefined ||
    resetRaw === undefined
  ) {
    return null;
  }

  const limit = Number(limitRaw);
  const remaining = Number(remainingRaw);
  const reset = Number(resetRaw);
  if (Number.isNaN(limit) || Number.isNaN(remaining) || Number.isNaN(reset)) {
    return null;
  }

  return { limit, remaining, reset };
}

// --- 副作用（import 時に実行される IIFE） ---

interface McxXhr extends XMLHttpRequest {
  __mcxUrl?: string;
}

(function () {
  function isMonitorEnabled(): boolean {
    // 既定（undefined）は後方互換のため有効扱い。
    return window.__multiColumnXConfig?.apiRateLimitMonitorEnabled !== false;
  }

  if (!isMonitorEnabled()) return;

  function getWebviewLabel(): string {
    return (
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ??
      window.__TAURI__?.core?.invoke?.name ??
      ""
    );
  }

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke =
      window.__TAURI_INTERNALS__?.invoke ??
      window.__TAURI__?.core?.invoke ??
      window.__TAURI__?.invoke;
    if (!invoke) return;
    invoke(cmd, args).catch(() => {});
  }

  function reportRateLimit(url: string, headersRaw: string): void {
    const bucketKey = extractBucketKey(url, location.href);
    if (!bucketKey) return;
    const parsed = parseRateLimitHeaders(headersRaw);
    if (!parsed) return;
    const label = getWebviewLabel();
    if (!label) return;
    tauriInvoke("report_api_rate_limit", {
      label,
      bucketKey,
      limit: parsed.limit,
      remaining: parsed.remaining,
      reset: parsed.reset,
    });
  }

  if (!window.__xhrRateLimitPatched) {
    window.__xhrRateLimitPatched = true;

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      this: McxXhr,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.__mcxUrl = typeof url === "string" ? url : url.toString();
      return (
        origOpen as unknown as (
          this: XMLHttpRequest,
          method: string,
          url: string | URL,
          ...rest: unknown[]
        ) => void
      ).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.send = function (
      this: McxXhr,
      ...args: unknown[]
    ) {
      this.addEventListener("load", () => {
        const url = this.__mcxUrl;
        if (typeof url === "string") {
          reportRateLimit(url, this.getAllResponseHeaders());
        }
      });
      return (
        origSend as unknown as (
          this: XMLHttpRequest,
          ...args: unknown[]
        ) => void
      ).apply(this, args);
    } as typeof XMLHttpRequest.prototype.send;
  }
})();

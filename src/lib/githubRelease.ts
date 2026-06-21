export interface LatestRelease {
  version: string;
  notes?: string;
  apkUrl: string;
}

const LATEST_RELEASE_API =
  "https://api.github.com/repos/natsuyasai/multi-column-x/releases/latest";

interface GhAsset {
  name?: string;
  browser_download_url?: string;
}

/** GitHub Releases API の latest レスポンスから更新情報を抽出する。 */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as { tag_name?: string; body?: string; assets?: GhAsset[] };
  if (!obj.tag_name) return null;
  const apk = (obj.assets ?? []).find((a) => a.name?.endsWith(".apk"));
  if (!apk?.browser_download_url) return null;
  return {
    version: obj.tag_name.replace(/^v/i, ""),
    notes: obj.body || undefined,
    apkUrl: apk.browser_download_url,
  };
}

/** GitHub Releases API から最新リリース情報を取得する。 */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return parseLatestRelease(await res.json());
}

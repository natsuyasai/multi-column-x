export interface LatestRelease {
  version: string;
  notes?: string;
  apkUrl: string;
}

const LATEST_RELEASE_API =
  "https://api.github.com/repos/natsuyasai/multi-column-x/releases/latest";

const RELEASE_BY_TAG_API =
  "https://api.github.com/repos/natsuyasai/multi-column-x/releases/tags";

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

/** 指定バージョンのリリースノート(body)を取得する。無ければ null。 */
export async function fetchReleaseNotes(
  version: string,
): Promise<string | null> {
  const normalized = version.replace(/^v/i, "");
  const res = await fetch(`${RELEASE_BY_TAG_API}/v${normalized}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { body?: string };
  return json.body || null;
}

/** GitHub Releases API から最新リリース情報を取得する。 */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return parseLatestRelease(await res.json());
}

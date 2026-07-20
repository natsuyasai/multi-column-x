export interface LatestRelease {
  version: string;
  notes?: string;
  apkUrl: string;
  apkSha256?: string;
}

const LATEST_RELEASE_API =
  "https://api.github.com/repos/natsuyasai/multi-column-x/releases/latest";

const RELEASE_BY_TAG_API =
  "https://api.github.com/repos/natsuyasai/multi-column-x/releases/tags";

interface GhAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string;
}

/** GitHub アセットの digest("sha256:<hex>") から小文字64桁hexを取り出す。不正・非sha256ならnull。 */
export function parseDigestSha256(digest: string | undefined): string | null {
  if (!digest) return null;
  const prefix = "sha256:";
  if (!digest.startsWith(prefix)) return null;
  const hex = digest.slice(prefix.length);
  return /^[0-9a-f]{64}$/i.test(hex) ? hex.toLowerCase() : null;
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
    apkSha256: parseDigestSha256(apk.digest) ?? undefined,
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

export interface LatestRelease {
  version: string;
  notes?: string;
  apkUrl: string;
  sha256Url?: string;
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
  const sha256 = (obj.assets ?? []).find((a) =>
    a.name?.endsWith(".apk.sha256"),
  );
  return {
    version: obj.tag_name.replace(/^v/i, ""),
    notes: obj.body || undefined,
    apkUrl: apk.browser_download_url,
    sha256Url: sha256?.browser_download_url,
  };
}

/** .sha256 アセットのテキストから 64 桁 hex を取り出す。不正なら null。 */
export function parseSha256Text(text: string): string | null {
  const token = text.trim().split(/\s+/)[0] ?? "";
  return /^[0-9a-f]{64}$/i.test(token) ? token.toLowerCase() : null;
}

/** sha256 アセット URL から期待ハッシュ(小文字64桁hex)を取得する。取得失敗・不正なら null。 */
export async function fetchApkSha256(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return parseSha256Text(await res.text());
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

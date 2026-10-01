// 撮影スクリプトの純粋ロジック（副作用なし）。

/** storyId から Storybook の単体表示 URL を組み立てる。 */
export function buildStoryUrl(baseUrl, storyId) {
  return `${baseUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}

/** index.json（Storybook 10 の entries 形式）から story の ID 集合を得る。 */
export function collectStoryIds(indexJson) {
  const entries = indexJson?.entries ?? indexJson?.stories ?? {};
  return new Set(
    Object.values(entries)
      .filter((e) => e.type === undefined || e.type === "story")
      .map((e) => e.id),
  );
}

/** targets のうち index.json に存在しない storyId を返す。 */
export function findMissingStoryIds(targets, indexJson) {
  const ids = collectStoryIds(indexJson);
  return targets.filter((t) => !ids.has(t.storyId)).map((t) => t.storyId);
}

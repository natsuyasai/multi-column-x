/**
 * リリースノート生成の純粋ロジック
 * @module releaseNotes
 */

/** @typedef {"feature" | "improvement" | "fix"} Category */

/**
 * Conventional Commits の接頭辞とカテゴリのマッピング
 * @type {Record<string, Category>}
 */
const CONVENTIONAL_TYPE_MAP = {
  feat: "feature",
  fix: "fix",
};

/** Conventional Commits 形式のタイトルにマッチする正規表現 */
const CONVENTIONAL_PATTERN = /^[a-z]+(?:\([^)]*\))?!?:/;

/**
 * PR 本文からリリースノートセクションの箇条書き項目を抽出する。
 *
 * @param {string | null | undefined} prBody
 * @returns {string[]}
 */
export const extractReleaseNotesSection = (prBody) => {
  if (!prBody) return [];

  const lines = prBody.split("\n");
  let inSection = false;
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 見出し行の判定
    if (trimmed.startsWith("#")) {
      // `## リリースノート` 見出しか確認（前後スペース許容）
      if (/^#{1,6}\s+リリースノート\s*$/.test(trimmed)) {
        inSection = true;
      } else if (inSection) {
        // 別の見出しに達したら終了
        break;
      }
      continue;
    }

    if (!inSection) continue;

    // 箇条書き行（前置スペース許容、- または *）
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
    }
  }

  return items;
};

/**
 * PR のカテゴリを判定する。
 *
 * @param {{ title: string; labels?: string[] }} pr
 * @returns {Category}
 */
export const categorize = ({ title, labels = [] }) => {
  // Conventional Commits 形式かチェック
  if (CONVENTIONAL_PATTERN.test(title)) {
    const type = title.split(/[(:!]/)[0];
    return CONVENTIONAL_TYPE_MAP[type] ?? "improvement";
  }

  // ラベルで判定
  if (labels.some((l) => l === "feature" || l === "enhancement")) {
    return "feature";
  }
  if (labels.some((l) => l === "bug" || l === "fix")) {
    return "fix";
  }

  return "improvement";
};

/**
 * @typedef {{ title: string; body?: string | null; labels?: string[] }} PR
 */

/**
 * PR 配列からリリースノートの Markdown 本文を生成する。
 *
 * @param {PR[]} prs
 * @returns {string}
 */
export const buildReleaseBody = (prs) => {
  /** @type {Record<Category, string[]>} */
  const buckets = { feature: [], improvement: [], fix: [] };

  for (const pr of prs) {
    const items = extractReleaseNotesSection(pr.body);
    if (items.length === 0) continue;

    const category = categorize(pr);
    buckets[category].push(...items);
  }

  /** @type {Array<{ heading: string; category: Category }>} */
  const sections = [
    { heading: "新機能", category: "feature" },
    { heading: "改善", category: "improvement" },
    { heading: "不具合修正", category: "fix" },
  ];

  const parts = sections
    .filter(({ category }) => buckets[category].length > 0)
    .map(
      ({ heading, category }) =>
        `### ${heading}\n${buckets[category].map((item) => `- ${item}`).join("\n")}`,
    );

  return parts.join("\n\n");
};

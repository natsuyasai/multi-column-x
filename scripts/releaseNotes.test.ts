import { describe, expect, it } from "vitest";
import {
  buildReleaseBody,
  categorize,
  extractReleaseNotesSection,
} from "./releaseNotes.mjs";

// ---------------------------------------------------------------
// extractReleaseNotesSection
// ---------------------------------------------------------------
describe("extractReleaseNotesSection", () => {
  it("セクションがある場合は箇条書き本文の配列を返す", () => {
    const body =
      "## リリースノート\n- 新しいタブ追加\n- 表示が速くなった\n## その他\n- 関係ない";
    expect(extractReleaseNotesSection(body)).toEqual([
      "新しいタブ追加",
      "表示が速くなった",
    ]);
  });

  it("次の見出し行で抽出を打ち切る", () => {
    const body = "## リリースノート\n- A\n- B\n# 大見出し\n- C";
    expect(extractReleaseNotesSection(body)).toEqual(["A", "B"]);
  });

  it("セクションがない場合は空配列を返す", () => {
    const body = "## その他\n- 何か";
    expect(extractReleaseNotesSection(body)).toEqual([]);
  });

  it("null を渡すと空配列を返す", () => {
    expect(extractReleaseNotesSection(null)).toEqual([]);
  });

  it("undefined を渡すと空配列を返す", () => {
    expect(extractReleaseNotesSection(undefined)).toEqual([]);
  });

  it("空文字を渡すと空配列を返す", () => {
    expect(extractReleaseNotesSection("")).toEqual([]);
  });

  it("* マーカーの箇条書きも抽出できる", () => {
    const body = "## リリースノート\n* 機能A\n* 機能B";
    expect(extractReleaseNotesSection(body)).toEqual(["機能A", "機能B"]);
  });

  it("前置スペース付きの箇条書きも抽出できる", () => {
    const body = "## リリースノート\n  - 字下げ項目\n   * スペース3つ";
    expect(extractReleaseNotesSection(body)).toEqual([
      "字下げ項目",
      "スペース3つ",
    ]);
  });

  it("箇条書き以外の行は無視する", () => {
    const body =
      "## リリースノート\n通常のテキスト行\n- 有効な項目\n空行\n- 別の項目";
    expect(extractReleaseNotesSection(body)).toEqual([
      "有効な項目",
      "別の項目",
    ]);
  });

  it("空行は無視する", () => {
    const body = "## リリースノート\n\n- A\n\n- B\n";
    expect(extractReleaseNotesSection(body)).toEqual(["A", "B"]);
  });

  it("見出し行の前後の空白を許容する", () => {
    const body = "  ## リリースノート  \n- アイテム";
    expect(extractReleaseNotesSection(body)).toEqual(["アイテム"]);
  });
});

// ---------------------------------------------------------------
// categorize
// ---------------------------------------------------------------
describe("categorize", () => {
  it("feat: 接頭辞は feature を返す", () => {
    expect(categorize({ title: "feat: 新機能追加" })).toBe("feature");
  });

  it("fix: 接頭辞は fix を返す", () => {
    expect(categorize({ title: "fix: バグ修正" })).toBe("fix");
  });

  it("feat(ui): スコープ付きは feature を返す", () => {
    expect(categorize({ title: "feat(ui): UIを改善" })).toBe("feature");
  });

  it("fix(api)!: スコープ+ブレーキングチェンジは fix を返す", () => {
    expect(categorize({ title: "fix(api)!: 破壊的変更" })).toBe("fix");
  });

  it("feat!: ブレーキングチェンジ付き feat は feature を返す", () => {
    expect(categorize({ title: "feat!: 大幅改変" })).toBe("feature");
  });

  it("chore: 接頭辞は improvement を返す", () => {
    expect(categorize({ title: "chore: 内部整理" })).toBe("improvement");
  });

  it("perf: 接頭辞は improvement を返す", () => {
    expect(categorize({ title: "perf: パフォーマンス改善" })).toBe(
      "improvement",
    );
  });

  it("refactor: 接頭辞は improvement を返す", () => {
    expect(categorize({ title: "refactor: コードの整理" })).toBe("improvement");
  });

  it("docs: 接頭辞は improvement を返す", () => {
    expect(categorize({ title: "docs: ドキュメント更新" })).toBe("improvement");
  });

  it("Conventional 形式でない場合、feature ラベルがあれば feature を返す", () => {
    expect(categorize({ title: "新機能を追加した", labels: ["feature"] })).toBe(
      "feature",
    );
  });

  it("Conventional 形式でない場合、enhancement ラベルがあれば feature を返す", () => {
    expect(categorize({ title: "何か改善", labels: ["enhancement"] })).toBe(
      "feature",
    );
  });

  it("Conventional 形式でない場合、bug ラベルがあれば fix を返す", () => {
    expect(categorize({ title: "バグを直した", labels: ["bug"] })).toBe("fix");
  });

  it("Conventional 形式でない場合、fix ラベルがあれば fix を返す", () => {
    expect(categorize({ title: "修正", labels: ["fix"] })).toBe("fix");
  });

  it("Conventional 形式でなくラベルもなければ improvement を返す", () => {
    expect(categorize({ title: "雑多な変更" })).toBe("improvement");
  });

  it("Conventional 形式でなくラベルが空配列なら improvement を返す", () => {
    expect(categorize({ title: "何か", labels: [] })).toBe("improvement");
  });
});

// ---------------------------------------------------------------
// buildReleaseBody
// ---------------------------------------------------------------
describe("buildReleaseBody", () => {
  it("3カテゴリ混在の場合は 新機能→改善→不具合修正 の順で出力する", () => {
    const prs = [
      {
        title: "feat: 新機能A",
        body: "## リリースノート\n- 新機能Aの説明",
        labels: [],
      },
      {
        title: "fix: バグ修正",
        body: "## リリースノート\n- 修正した内容",
        labels: [],
      },
      {
        title: "chore: 内部改善",
        body: "## リリースノート\n- 内部処理を整理",
        labels: [],
      },
    ];
    const result = buildReleaseBody(prs);
    expect(result).toBe(
      "### 新機能\n- 新機能Aの説明\n\n### 改善\n- 内部処理を整理\n\n### 不具合修正\n- 修正した内容",
    );
  });

  it("項目が0件のカテゴリは見出しごと省略する", () => {
    const prs = [
      {
        title: "feat: 新機能",
        body: "## リリースノート\n- 機能追加",
        labels: [],
      },
    ];
    const result = buildReleaseBody(prs);
    expect(result).toBe("### 新機能\n- 機能追加");
  });

  it("リリースノートセクションがないPRはスキップする", () => {
    const prs = [
      {
        title: "feat: 新機能",
        body: "## リリースノート\n- 機能追加",
        labels: [],
      },
      {
        title: "fix: バグ修正",
        body: "## 変更点\n- 関係ない",
        labels: [],
      },
    ];
    const result = buildReleaseBody(prs);
    expect(result).toBe("### 新機能\n- 機能追加");
  });

  it("全PRがセクション無しの場合は空文字列を返す", () => {
    const prs = [{ title: "chore: 雑多な作業", body: "特になし", labels: [] }];
    expect(buildReleaseBody(prs)).toBe("");
  });

  it("空配列を渡すと空文字列を返す", () => {
    expect(buildReleaseBody([])).toBe("");
  });

  it("同一カテゴリ内の項目はPR順→PR内項目順を維持する", () => {
    const prs = [
      {
        title: "feat: PR1",
        body: "## リリースノート\n- A\n- B",
        labels: [],
      },
      {
        title: "feat: PR2",
        body: "## リリースノート\n- C\n- D",
        labels: [],
      },
    ];
    const result = buildReleaseBody(prs);
    expect(result).toBe("### 新機能\n- A\n- B\n- C\n- D");
  });

  it("末尾に余分な改行がない", () => {
    const prs = [
      {
        title: "fix: 修正",
        body: "## リリースノート\n- 修正内容",
        labels: [],
      },
    ];
    const result = buildReleaseBody(prs);
    expect(result).not.toMatch(/\n$/);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildRestorePayload,
  canExecuteRestore,
  countColumnsByBackupAccount,
  countRestoreSummary,
  describeBackupError,
  findSharedTargets,
  normalizeGridPositions,
  suggestMapping,
  validateBackupLists,
  type BackupContent,
  type RestoreMapping,
} from "@/lib/backupRestore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Account, Column, ColumnPreset } from "@/types";

function makeColumn(overrides: Partial<Column> & Pick<Column, "id">): Column {
  return {
    accountId: "A",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: DEFAULT_COLUMN_SETTINGS,
    ...overrides,
  };
}

function makeExternal(id: string, gridCol: number): Column {
  return makeColumn({
    id,
    accountId: id,
    pageType: "external",
    customUrl: "https://example.com/",
    gridCol,
  });
}

function makeContent(overrides: Partial<BackupContent> = {}): BackupContent {
  const deviceDependent = [
    "windowBounds",
    "pendingDataDirectoryDeletions",
    "hardwareVideoDecodeEnabled",
    "h264DownloadPromptDismissed",
  ];
  const portable = Object.fromEntries(
    Object.entries(DEFAULT_GLOBAL_SETTINGS).filter(
      ([key]) => !deviceDependent.includes(key),
    ),
  ) as BackupContent["globalSettings"];
  return {
    accounts: [
      { backupAccountId: "A", label: "アカウントA", color: "#1d9bf0" },
      { backupAccountId: "B", label: "アカウントB", color: "#e0245e" },
    ],
    columns: [],
    globalSettings: portable,
    ...overrides,
  };
}

function sequentialIds() {
  let n = 0;
  return () => `new-${++n}`;
}

function targetAccount(id: string, xUserId?: string): Account {
  return {
    id,
    label: id,
    dataDirectory: `/data/${id}`,
    color: "#000000",
    createdAt: "2026-01-01T00:00:00Z",
    xUserId,
  };
}

describe("suggestMapping（Xユーザー IDによる初期候補）", () => {
  it("Xユーザー IDが一致するリストア先アカウントが初期選択される", () => {
    const backup = [
      { backupAccountId: "A", label: "A", color: "#111", xUserId: "100" },
    ];
    const targets = [targetAccount("t1", "999"), targetAccount("t2", "100")];

    expect(suggestMapping(backup, targets)).toEqual({ A: "t2" });
  });

  it("バックアップ側のXユーザー IDが未設定なら初期候補を選ばない", () => {
    const backup = [{ backupAccountId: "A", label: "A", color: "#111" }];
    const targets = [targetAccount("t1", "100")];

    expect(suggestMapping(backup, targets)).toEqual({ A: null });
  });

  it("リストア先側のXユーザー IDが未設定なら初期候補を選ばない", () => {
    const backup = [
      { backupAccountId: "A", label: "A", color: "#111", xUserId: "100" },
    ];
    const targets = [targetAccount("t1")];

    expect(suggestMapping(backup, targets)).toEqual({ A: null });
  });

  it("Xユーザー IDが一致しなければ初期候補を選ばない", () => {
    const backup = [
      { backupAccountId: "A", label: "A", color: "#111", xUserId: "100" },
    ];
    const targets = [targetAccount("t1", "200")];

    expect(suggestMapping(backup, targets)).toEqual({ A: null });
  });

  it("同じXユーザー IDのリストア先が複数あれば一覧順で最初を選ぶ", () => {
    const backup = [
      { backupAccountId: "A", label: "A", color: "#111", xUserId: "100" },
    ];
    const targets = [targetAccount("t1", "100"), targetAccount("t2", "100")];

    expect(suggestMapping(backup, targets)).toEqual({ A: "t1" });
  });

  it("全てのバックアップ内アカウントが結果のキーに含まれる", () => {
    const backup = [
      { backupAccountId: "A", label: "A", color: "#111", xUserId: "100" },
      { backupAccountId: "B", label: "B", color: "#222" },
    ];

    expect(
      Object.keys(suggestMapping(backup, [targetAccount("t1", "100")])),
    ).toEqual(["A", "B"]);
  });
});

describe("canExecuteRestore（紐づけが1件もない場合は実行不可）", () => {
  it("紐づけが空なら実行できない", () => {
    expect(canExecuteRestore({})).toBe(false);
  });

  it("全て「復元しない」なら実行できない", () => {
    expect(canExecuteRestore({ A: null, B: null })).toBe(false);
  });

  it("1件でも紐づけがあれば実行できる", () => {
    expect(canExecuteRestore({ A: "t1", B: null })).toBe(true);
  });
});

describe("findSharedTargets（同じ復元先への重複割り当て警告）", () => {
  it("複数のバックアップ内アカウントが割り当てられた復元先を返す", () => {
    expect(findSharedTargets({ A: "t1", B: "t1", C: "t2" })).toEqual(["t1"]);
  });

  it("重複がなければ空", () => {
    expect(findSharedTargets({ A: "t1", B: "t2", C: null })).toEqual([]);
  });

  it("「復元しない」同士は重複として扱わない", () => {
    expect(findSharedTargets({ A: null, B: null })).toEqual([]);
  });
});

describe("カラム件数の集計", () => {
  const columns = [
    makeColumn({ id: "a1", accountId: "A" }),
    makeColumn({ id: "a2", accountId: "A" }),
    makeColumn({ id: "b1", accountId: "B" }),
    makeExternal("ext1", 3),
  ];

  it("紐づけ画面の各行に出すアカウント別カラム数を数える（外部カラムは含めない）", () => {
    expect(countColumnsByBackupAccount(columns)).toEqual({ A: 2, B: 1 });
  });

  it("復元されるカラムとスキップされるカラムの件数を数える（外部カラムは復元側）", () => {
    const mapping: RestoreMapping = { A: "t1", B: null };

    expect(countRestoreSummary(columns, mapping)).toEqual({
      restore: 3,
      skip: 1,
    });
  });

  it("未指定のアカウントはスキップとして数える", () => {
    expect(countRestoreSummary(columns, { A: "t1" })).toEqual({
      restore: 3,
      skip: 1,
    });
  });
});

describe("buildRestorePayload（紐づけに従う差し替え）", () => {
  const baseColumns = [
    makeColumn({ id: "a1", accountId: "A", gridCol: 1, gridRow: 1 }),
    makeColumn({ id: "b1", accountId: "B", gridCol: 2, gridRow: 1 }),
    makeExternal("ext1", 3),
  ];

  it("Aを復元先Xに紐づけ、Bを復元しない場合、AのカラムはXを参照しBのカラムは復元されない", () => {
    const content = makeContent({ columns: baseColumns });

    const { columns } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    const nonExternal = columns.filter((c) => c.pageType !== "external");
    expect(nonExternal).toHaveLength(1);
    expect(nonExternal[0].accountId).toBe("X");
    expect(columns.some((c) => c.accountId === "B")).toBe(false);
  });

  it("外部カラムは紐づけに関係なく復元され、accountId は再採番後の自身の id に一致する", () => {
    const content = makeContent({ columns: baseColumns });

    const { columns } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    const external = columns.find((c) => c.pageType === "external");
    expect(external).toBeDefined();
    expect(external!.accountId).toBe(external!.id);
    expect(external!.id).not.toBe("ext1");
  });

  it("同じ復元先を複数のバックアップ内アカウントに割り当てても両方復元される", () => {
    const content = makeContent({ columns: baseColumns });

    const { columns } = buildRestorePayload(
      content,
      { A: "X", B: "X" },
      sequentialIds(),
    );

    expect(
      columns.filter((c) => c.pageType !== "external").map((c) => c.accountId),
    ).toEqual(["X", "X"]);
  });

  it("プリセット内カラムの accountId も同じ紐づけで差し替わる", () => {
    const preset: ColumnPreset = {
      id: "p1",
      name: "プリセット",
      columns: [
        makeColumn({ id: "pa", accountId: "A" }),
        makeColumn({ id: "pb", accountId: "B", gridCol: 2 }),
      ],
    };
    const base = makeContent();
    const content = makeContent({
      columns: baseColumns,
      globalSettings: { ...base.globalSettings, presets: [preset] },
    });

    const { globalSettings } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    expect(globalSettings.presets).toHaveLength(1);
    expect(globalSettings.presets[0].columns.map((c) => c.accountId)).toEqual([
      "X",
    ]);
  });

  it("復元できるカラムが残らないプリセットは捨てられる", () => {
    const preset: ColumnPreset = {
      id: "p1",
      name: "Bだけ",
      columns: [makeColumn({ id: "pb", accountId: "B" })],
    };
    const base = makeContent();
    const content = makeContent({
      columns: baseColumns,
      globalSettings: { ...base.globalSettings, presets: [preset] },
    });

    const { globalSettings } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    expect(globalSettings.presets).toEqual([]);
  });

  it("defaultAccountId も紐づけ先に差し替わる", () => {
    const base = makeContent();
    const content = makeContent({
      columns: baseColumns,
      globalSettings: { ...base.globalSettings, defaultAccountId: "A" },
    });

    const { globalSettings } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    expect(globalSettings.defaultAccountId).toBe("X");
  });

  it("defaultAccountId が復元しないアカウントなら未設定になる", () => {
    const base = makeContent();
    const content = makeContent({
      columns: baseColumns,
      globalSettings: { ...base.globalSettings, defaultAccountId: "B" },
    });

    const { globalSettings } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    expect(globalSettings.defaultAccountId).toBeUndefined();
  });

  it("端末依存項目（windowBounds と削除待ち一覧）は結果に含まれない", () => {
    const content = makeContent({ columns: baseColumns });

    const { globalSettings } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    expect(globalSettings).not.toHaveProperty("windowBounds");
    expect(globalSettings).not.toHaveProperty("pendingDataDirectoryDeletions");
  });

  it("追加した2つの設定はバックアップに含まれない", () => {
    const content = makeContent({ columns: baseColumns });

    const { globalSettings } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    expect(globalSettings).not.toHaveProperty("hardwareVideoDecodeEnabled");
    expect(globalSettings).not.toHaveProperty("h264DownloadPromptDismissed");
  });

  it("入力のバックアップ内容を変更しない", () => {
    const content = makeContent({ columns: baseColumns });
    const snapshot = JSON.parse(JSON.stringify(content));

    buildRestorePayload(content, { A: "X", B: null }, sequentialIds());

    expect(content).toEqual(snapshot);
  });
});

describe("buildRestorePayload（id の再採番）", () => {
  it("危険な id・空文字列・重複 id は全て新しい安全な id に置き換わる", () => {
    const content = makeContent({
      columns: [
        makeColumn({ id: "../x", accountId: "A", gridCol: 1 }),
        makeColumn({ id: "a/b", accountId: "A", gridCol: 2 }),
        makeColumn({ id: "a\\b", accountId: "A", gridCol: 3 }),
        makeColumn({ id: "", accountId: "A", gridCol: 4 }),
        makeColumn({ id: "dup", accountId: "A", gridCol: 5 }),
        makeColumn({ id: "dup", accountId: "A", gridCol: 6 }),
      ],
    });

    const { columns } = buildRestorePayload(content, { A: "X" }, () =>
      crypto.randomUUID(),
    );

    const ids = columns.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).not.toBe("");
      expect(id).not.toContain("..");
      expect(id).not.toContain("/");
      expect(id).not.toContain("\\");
    }
    expect(ids).not.toContain("dup");
  });

  it("プリセット内カラムを含む全カラムの id が互いに重複しない", () => {
    const preset: ColumnPreset = {
      id: "p1",
      name: "プリセット",
      columns: [makeColumn({ id: "same", accountId: "A" })],
    };
    const base = makeContent();
    const content = makeContent({
      columns: [makeColumn({ id: "same", accountId: "A" })],
      globalSettings: { ...base.globalSettings, presets: [preset] },
    });

    const { columns, globalSettings } = buildRestorePayload(
      content,
      { A: "X" },
      sequentialIds(),
    );

    const ids = [
      ...columns.map((c) => c.id),
      ...globalSettings.presets.flatMap((p) => p.columns.map((c) => c.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("same");
  });
});

describe("normalizeGridPositions（グリッド配置の正規化）", () => {
  it("空き列を詰めて gridCol を 1..k にする", () => {
    const result = normalizeGridPositions([
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c3", gridCol: 3, gridRow: 1 }),
      makeColumn({ id: "c7", gridCol: 7, gridRow: 1 }),
    ]);

    expect(result.map((c) => c.gridCol)).toEqual([1, 2, 3]);
  });

  it("列内の gridRow を 1..m に詰める", () => {
    const result = normalizeGridPositions([
      makeColumn({ id: "r2", gridCol: 1, gridRow: 2 }),
      makeColumn({ id: "r5", gridCol: 1, gridRow: 5 }),
    ]);

    expect(result.map((c) => [c.id, c.gridRow])).toEqual([
      ["r2", 1],
      ["r5", 2],
    ]);
  });

  it("order を gridCol 昇順 → gridRow 昇順の 0..n-1 に振り直す", () => {
    const result = normalizeGridPositions([
      makeColumn({ id: "late", gridCol: 4, gridRow: 1, order: 0 }),
      makeColumn({ id: "early", gridCol: 2, gridRow: 1, order: 9 }),
    ]);

    const byId = Object.fromEntries(result.map((c) => [c.id, c.order]));
    expect(byId).toEqual({ early: 0, late: 1 });
  });
});

describe("buildRestorePayload（スキップ後のグリッド正規化）", () => {
  it("カラムが全て復元されなかった列を詰める", () => {
    const content = makeContent({
      columns: [
        makeColumn({ id: "a1", accountId: "A", gridCol: 1 }),
        makeColumn({ id: "b1", accountId: "B", gridCol: 2 }),
        makeColumn({ id: "a2", accountId: "A", gridCol: 3 }),
      ],
    });

    const { columns } = buildRestorePayload(
      content,
      { A: "X", B: null },
      sequentialIds(),
    );

    expect(columns.map((c) => c.gridCol)).toEqual([1, 2]);
    expect(columns.map((c) => c.order)).toEqual([0, 1]);
  });
});

describe("validateBackupLists（NGワード・ユーザー IDの検証）", () => {
  it("正常な内容は null を返す", () => {
    expect(validateBackupLists(makeContent())).toBeNull();
  });

  it("グローバルの NGワードに不正な正規表現があればエラーを返す", () => {
    const base = makeContent();
    const content = makeContent({
      globalSettings: { ...base.globalSettings, ngWords: ["/(/"] },
    });

    expect(validateBackupLists(content)).not.toBeNull();
  });

  it("カラム設定の NGワードに不正な正規表現があればエラーを返す", () => {
    const content = makeContent({
      columns: [
        makeColumn({
          id: "c1",
          settings: { ...DEFAULT_COLUMN_SETTINGS, ngWords: ["/[/"] },
        }),
      ],
    });

    expect(validateBackupLists(content)).not.toBeNull();
  });

  it("プリセット内カラムの NGワードに不正な正規表現があればエラーを返す", () => {
    const base = makeContent();
    const content = makeContent({
      globalSettings: {
        ...base.globalSettings,
        presets: [
          {
            id: "p1",
            name: "p",
            columns: [
              makeColumn({
                id: "c1",
                settings: { ...DEFAULT_COLUMN_SETTINGS, ngWords: ["/(/"] },
              }),
            ],
          },
        ],
      },
    });

    expect(validateBackupLists(content)).not.toBeNull();
  });

  it("リポスト非表示ユーザー IDが X の規則に違反していればエラーを返す", () => {
    const base = makeContent();
    const content = makeContent({
      globalSettings: {
        ...base.globalSettings,
        repostHiddenUserIds: ["not valid id!"],
      },
    });

    expect(validateBackupLists(content)).not.toBeNull();
  });
});

describe("describeBackupError（エラー種別から文言を作る）", () => {
  it("将来バージョンは「アプリを更新してください」と案内する", () => {
    const message = describeBackupError({
      kind: "futureVersion",
      found: 2,
      current: 1,
    });

    expect(message).toContain("アプリを更新してください");
  });

  it("将来バージョン以外のエラーは更新案内を含まず、理由を示す", () => {
    const kinds = [
      { kind: "brokenJson" },
      { kind: "formatMismatch" },
      { kind: "tooLarge" },
      { kind: "limitExceeded" },
      { kind: "invalidField" },
      { kind: "io" },
      { kind: "settingsUnreadable" },
    ] as const;

    const messages = kinds.map((e) => describeBackupError(e));

    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain("アプリを更新してください");
    }
    expect(new Set(messages).size).toBe(messages.length);
  });
});

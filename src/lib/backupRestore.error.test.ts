import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { describeBackupError, toBackupErrorInfo } from "@/lib/backupRestore";
import { containsJapanese } from "@/test-utils/japanese";

describe("toBackupErrorInfo（invoke の reject 値の変換）", () => {
  it("Rust の BackupError（kind を持つオブジェクト）はそのまま通す", () => {
    const error = { kind: "futureVersion", found: 2, current: 1 };

    expect(toBackupErrorInfo(error)).toEqual(error);
  });

  it("将来バージョンのエラーは変換後も更新案内の文言になる", () => {
    const info = toBackupErrorInfo({
      kind: "futureVersion",
      found: 9,
      current: 1,
    });

    expect(describeBackupError(info, i18n.t)).toContain(
      "アプリを更新してください",
    );
  });

  it("未知の kind を持つオブジェクトは io として扱う", () => {
    expect(toBackupErrorInfo({ kind: "unknown" }).kind).toBe("io");
  });

  it("文字列の reject は io として扱いメッセージを保持する", () => {
    expect(
      toBackupErrorInfo("forbidden: caller must be the main window"),
    ).toEqual({
      kind: "io",
      message: "forbidden: caller must be the main window",
    });
  });

  it("Error インスタンスは io として扱いメッセージを保持する", () => {
    expect(toBackupErrorInfo(new Error("boom"))).toEqual({
      kind: "io",
      message: "boom",
    });
  });

  it("null や undefined でも例外を投げず io として扱う", () => {
    expect(toBackupErrorInfo(null).kind).toBe("io");
    expect(toBackupErrorInfo(undefined).kind).toBe("io");
  });
});

describe("describeBackupError（表示言語による切り替え）", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("復元失敗の種別コードを日本語のメッセージに変換する", () => {
    expect(describeBackupError({ kind: "settingsUnreadable" }, i18n.t)).toBe(
      "現在の設定を読み込めていないため、復元できません。アプリを再起動してください。",
    );
  });

  it("同じ種別コードを英語のメッセージに変換する", async () => {
    await i18n.changeLanguage("en");

    expect(describeBackupError({ kind: "settingsUnreadable" }, i18n.t)).toBe(
      "Current settings could not be loaded, so the backup cannot be restored. Please restart the app.",
    );
  });

  it("詳細付きのメッセージは日本語では全角括弧で値が埋め込まれる", () => {
    expect(
      describeBackupError({ kind: "io", message: "disk full" }, i18n.t),
    ).toBe("ファイルの読み書きに失敗しました（disk full）");
  });

  it("詳細付きのメッセージは英語では半角括弧で値が埋め込まれる", async () => {
    await i18n.changeLanguage("en");

    expect(
      describeBackupError({ kind: "io", message: "disk full" }, i18n.t),
    ).toBe("Failed to read or write the file (disk full)");
  });

  it("不正な値のエラーは項目と理由を連結した詳細を英語でも表示する", async () => {
    await i18n.changeLanguage("en");

    expect(
      describeBackupError(
        { kind: "invalidField", field: "columns[0]", reason: "too long" },
        i18n.t,
      ),
    ).toBe("The backup contains an invalid value (columns[0]: too long)");
  });

  it("詳細が無い場合は括弧を付けない", async () => {
    await i18n.changeLanguage("en");

    expect(describeBackupError({ kind: "limitExceeded" }, i18n.t)).toBe(
      "The number or length of items in the backup exceeds the limit",
    );
  });

  it("英語ではすべての種別で日本語を含まないメッセージを返す", async () => {
    await i18n.changeLanguage("en");
    const kinds = [
      "futureVersion",
      "brokenJson",
      "formatMismatch",
      "tooLarge",
      "limitExceeded",
      "invalidField",
      "io",
      "settingsUnreadable",
    ] as const;

    for (const kind of kinds) {
      const message = describeBackupError({ kind }, i18n.t);
      expect(containsJapanese(message), kind).toBe(false);
    }
  });
});

const REASON_CODES: Record<string, [string, string]> = {
  urlSchemeUnsupported: [
    "http または https の URL のみ指定できます",
    "Only http or https URLs are allowed",
  ],
  themeUnsupported: ["未対応のテーマです", "Unsupported theme"],
  columnScaleUnsupported: ["未対応の倍率です", "Unsupported scale"],
  schemaVersionTooOld: [
    "移行できない古いバージョンです",
    "Version is too old to migrate",
  ],
  schemaVersionInvalid: [
    "1 以上の整数で指定してください",
    "Must be an integer of 1 or more",
  ],
  idUnsafe: ["カラム id が安全ではありません", "Column id is not safe"],
  idConflictsWithExisting: [
    "復元先の既存カラム id と重複しています",
    "Conflicts with an existing column id at the restore target",
  ],
  idDuplicate: ["カラム id が重複しています", "Column id is duplicated"],
  externalAccountIdMismatch: [
    "外部カラムの accountId はカラム自身の id と一致する必要があります",
    "An external column's accountId must match the column's own id",
  ],
  accountMissing: [
    "復元先に存在しないアカウントを参照しています",
    "References an account that does not exist at the restore target",
  ],
};

const IO_CODES: Record<string, [string, string, string]> = {
  selectionCancelled: [
    "",
    "ファイル選択が中断されました",
    "File selection was interrupted",
  ],
  selectionTimeout: [
    "",
    "ファイル選択がタイムアウトしました",
    "File selection timed out",
  ],
  unexpectedReply: [
    "Saved",
    "想定外の応答: Saved",
    "Unexpected response: Saved",
  ],
  snapshotNamesExhausted: [
    "",
    "同一秒内の退避ファイル名が使い切られました",
    "Backup file names for the same second have run out",
  ],
};

describe("describeBackupError（理由コード・入出力コードの翻訳）", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it.each(Object.entries(REASON_CODES))(
    "理由コード %s は日本語では従来の文言のまま表示される",
    (reason, [ja]) => {
      expect(
        describeBackupError(
          { kind: "invalidField", field: "columns.id", reason },
          i18n.t,
        ),
      ).toBe(`バックアップに不正な値が含まれています（columns.id: ${ja}）`);
    },
  );

  it.each(Object.entries(REASON_CODES))(
    "理由コード %s は英語では日本語を含まない文言になる",
    async (reason, [, en]) => {
      await i18n.changeLanguage("en");

      const message = describeBackupError(
        { kind: "invalidField", field: "columns.id", reason },
        i18n.t,
      );

      expect(message).toBe(
        `The backup contains an invalid value (columns.id: ${en})`,
      );
      expect(containsJapanese(message)).toBe(false);
    },
  );

  it.each(Object.entries(IO_CODES))(
    "入出力コード %s は日本語では従来の文言のまま表示される",
    (code, [detail, ja]) => {
      expect(
        describeBackupError({ kind: "io", code, message: detail }, i18n.t),
      ).toBe(`ファイルの読み書きに失敗しました（${ja}）`);
    },
  );

  it.each(Object.entries(IO_CODES))(
    "入出力コード %s は英語では日本語を含まない文言になる",
    async (code, [detail, , en]) => {
      await i18n.changeLanguage("en");

      const message = describeBackupError(
        { kind: "io", code, message: detail },
        i18n.t,
      );

      expect(message).toBe(`Failed to read or write the file (${en})`);
      expect(containsJapanese(message)).toBe(false);
    },
  );

  it("未知の理由コードや解析エラーの生の文字列はそのまま表示する", () => {
    expect(
      describeBackupError(
        {
          kind: "invalidField",
          field: "file",
          reason: "missing field `id` at line 1",
        },
        i18n.t,
      ),
    ).toBe(
      "バックアップに不正な値が含まれています（file: missing field `id` at line 1）",
    );
    expect(
      describeBackupError(
        { kind: "invalidField", field: "x", reason: "futureReason" },
        i18n.t,
      ),
    ).toBe("バックアップに不正な値が含まれています（x: futureReason）");
  });

  it("未知の入出力コードは生のエラー文字列を表示する", () => {
    expect(
      describeBackupError(
        { kind: "io", code: "futureCode", message: "disk full" },
        i18n.t,
      ),
    ).toBe("ファイルの読み書きに失敗しました（disk full）");
  });
});

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

import { describe, expect, it } from "vitest";
import { describeBackupError, toBackupErrorInfo } from "@/lib/backupRestore";

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

    expect(describeBackupError(info)).toContain("アプリを更新してください");
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

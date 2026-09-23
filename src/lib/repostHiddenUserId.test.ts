import { describe, it, expect } from "vitest";
import { parseUserIdLines, validateUserIdLine } from "./repostHiddenUserId";

describe("parseUserIdLines", () => {
  it("入力は1行1IDで、1行ごとにIDとして取り出される", () => {
    expect(parseUserIdLines("alice\nbob")).toEqual(["alice", "bob"]);
  });

  it("空行は無視される", () => {
    expect(parseUserIdLines("alice\n\n\nbob\n")).toEqual(["alice", "bob"]);
  });

  it("空文字列は空配列になる", () => {
    expect(parseUserIdLines("")).toEqual([]);
  });

  it("前後の空白は無視される", () => {
    expect(parseUserIdLines("  alice \n\tbob\t")).toEqual(["alice", "bob"]);
  });

  it("空白のみの行は無視される", () => {
    expect(parseUserIdLines("alice\n   \nbob")).toEqual(["alice", "bob"]);
  });

  it("CRLF改行でも1行1IDとして扱われる", () => {
    expect(parseUserIdLines("alice\r\nbob\r\n")).toEqual(["alice", "bob"]);
  });

  it("先頭の@は除去される", () => {
    expect(parseUserIdLines("@alice\n  @bob  ")).toEqual(["alice", "bob"]);
  });

  it("@のみの行は空行として無視される", () => {
    expect(parseUserIdLines("@\nalice")).toEqual(["alice"]);
  });

  it("同じIDの重複は1件にまとめられる", () => {
    expect(parseUserIdLines("alice\nbob\nalice")).toEqual(["alice", "bob"]);
  });

  it("大文字小文字違いのIDも重複として扱い、先に書かれた表記を残す", () => {
    expect(parseUserIdLines("Alice\nALICE\nalice")).toEqual(["Alice"]);
  });

  it("@の有無だけが違うIDも重複として扱う", () => {
    expect(parseUserIdLines("@alice\nalice")).toEqual(["alice"]);
  });
});

describe("validateUserIdLine", () => {
  it("英数字とアンダースコアのIDは有効(null)を返す", () => {
    expect(validateUserIdLine("Alice_01")).toBeNull();
  });

  it("15文字のIDは有効(null)を返す", () => {
    expect(validateUserIdLine("a".repeat(15))).toBeNull();
  });

  it("1文字のIDは有効(null)を返す", () => {
    expect(validateUserIdLine("a")).toBeNull();
  });

  it("16文字以上のIDはエラーメッセージを返す", () => {
    expect(validateUserIdLine("a".repeat(16))).toBe(
      `\`${"a".repeat(16)}\` はXのユーザーIDとして正しくありません（英数字とアンダースコアの1〜15文字）`,
    );
  });

  it("空文字列はエラーメッセージを返す", () => {
    expect(validateUserIdLine("")).not.toBeNull();
  });

  it("ハイフンなど使えない文字を含むIDはエラーメッセージを返す", () => {
    expect(validateUserIdLine("bad-id")).toBe(
      "`bad-id` はXのユーザーIDとして正しくありません（英数字とアンダースコアの1〜15文字）",
    );
  });

  it("スラッシュを含むIDはエラーメッセージを返す", () => {
    expect(validateUserIdLine("alice/status")).not.toBeNull();
  });

  it("空白を含むIDはエラーメッセージを返す", () => {
    expect(validateUserIdLine("a b")).not.toBeNull();
  });

  it("日本語を含むIDはエラーメッセージを返す", () => {
    expect(validateUserIdLine("ユーザー")).not.toBeNull();
  });
});

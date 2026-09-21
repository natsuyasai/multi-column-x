import { describe, it, expect } from "vitest";
import {
  hrefToUserId,
  normalizeUserId,
  shouldHideByRepostUser,
} from "./repost_hide_matcher";

describe("inject/repost_hide_matcher", () => {
  describe("shouldHideByRepostUser", () => {
    it("指定ユーザーがリポストした投稿は非表示になる", () => {
      expect(shouldHideByRepostUser(["/HAJIME_2001"], ["HAJIME_2001"])).toBe(
        true,
      );
    });

    it("指定ユーザー自身の投稿は非表示にならない", () => {
      // socialContext を持たない投稿は、投稿者リンクを渡さないため空配列になる
      expect(shouldHideByRepostUser([], ["HAJIME_2001"])).toBe(false);
    });

    it("別のユーザーがリポストした投稿は非表示にならない", () => {
      expect(shouldHideByRepostUser(["/N_t447"], ["HAJIME_2001"])).toBe(false);
    });

    it("大文字小文字と先頭の@の違いは同じIDとして扱う", () => {
      expect(shouldHideByRepostUser(["/hajime_2001"], ["@HAJIME_2001"])).toBe(
        true,
      );
      expect(shouldHideByRepostUser(["/HAJIME_2001"], ["  hajime_2001 "])).toBe(
        true,
      );
    });

    it("IDを前方一致で含むだけの別IDは一致しない", () => {
      expect(shouldHideByRepostUser(["/HAJIME_20012"], ["HAJIME_2001"])).toBe(
        false,
      );
      expect(shouldHideByRepostUser(["/HAJIME"], ["HAJIME_2001"])).toBe(false);
    });

    it("ステータスURLは一致しない", () => {
      expect(
        shouldHideByRepostUser(["/HAJIME_2001/status/1"], ["HAJIME_2001"]),
      ).toBe(false);
    });

    it("リンクを持たないsocialContext（固定テキストのみ）は非表示にならない", () => {
      expect(shouldHideByRepostUser([], ["HAJIME_2001"])).toBe(false);
    });

    it("複数のリンクのうち1つでも一致すれば非表示になる", () => {
      expect(
        shouldHideByRepostUser(["/other", "/HAJIME_2001"], ["HAJIME_2001"]),
      ).toBe(true);
    });

    it("IDが1件も設定されていなければ何も非表示にならない", () => {
      expect(shouldHideByRepostUser(["/HAJIME_2001"], [])).toBe(false);
    });

    it("空文字や@だけのIDは無視され何も非表示にならない", () => {
      expect(shouldHideByRepostUser(["/HAJIME_2001"], ["", "  ", "@"])).toBe(
        false,
      );
    });
  });

  describe("normalizeUserId", () => {
    it("前後空白のトリム・先頭@の除去・小文字化を行う", () => {
      expect(normalizeUserId("  @HAJIME_2001 ")).toBe("hajime_2001");
    });

    it("先頭の@は1つだけ除去する", () => {
      expect(normalizeUserId("@@abc")).toBe("@abc");
    });
  });

  describe("hrefToUserId", () => {
    it("単一セグメントのhrefからIDを小文字で取り出す", () => {
      expect(hrefToUserId("/HAJIME_2001")).toBe("hajime_2001");
    });

    it("クエリやハッシュは除去して判定する", () => {
      expect(hrefToUserId("/abc?ref=1")).toBe("abc");
      expect(hrefToUserId("/abc#top")).toBe("abc");
    });

    it("複数セグメントや先頭スラッシュなし・空は null を返す", () => {
      expect(hrefToUserId("/abc/status/1")).toBeNull();
      expect(hrefToUserId("abc")).toBeNull();
      expect(hrefToUserId("/")).toBeNull();
      expect(hrefToUserId("")).toBeNull();
    });
  });
});

// repost_hide_matcher.ts の純粋関数に対する fast-check プロパティテスト。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  hrefToUserId,
  normalizeUserId,
  shouldHideByRepostUser,
} from "./repost_hide_matcher";

// X のユーザーID仕様に沿った文字集合
const USER_ID = fc.stringMatching(/^[A-Za-z0-9_]{1,15}$/);

describe("normalizeUserId プロパティ", () => {
  it("冪等である（n(n(x)) === n(x)）", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        // 先頭@が複数ある入力は1回目で1つだけ除去されるため、@を含まない入力で冪等性を検証する
        const input = raw.replace(/@/g, "");
        const once = normalizeUserId(input);
        expect(normalizeUserId(once)).toBe(once);
      }),
    );
  });

  it("大文字小文字の違いに影響されない", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(normalizeUserId(raw.toUpperCase())).toBe(
          normalizeUserId(raw.toLowerCase()),
        );
      }),
    );
  });

  it("先頭の@の有無と前後空白に影響されない", () => {
    fc.assert(
      fc.property(USER_ID, (id) => {
        expect(normalizeUserId(`  @${id} `)).toBe(normalizeUserId(id));
      }),
    );
  });
});

describe("hrefToUserId プロパティ", () => {
  it("スラッシュを含む残りセグメントを持つhrefでは常にnullを返す", () => {
    fc.assert(
      fc.property(USER_ID, USER_ID, (id, rest) => {
        expect(hrefToUserId(`/${id}/${rest}`)).toBeNull();
      }),
    );
  });

  it("単一セグメントのhrefは小文字化したIDを返す", () => {
    fc.assert(
      fc.property(USER_ID, (id) => {
        expect(hrefToUserId(`/${id}`)).toBe(id.toLowerCase());
      }),
    );
  });
});

describe("shouldHideByRepostUser プロパティ", () => {
  it("設定IDの大文字小文字・先頭@に関わらず /ID のhrefは一致する", () => {
    fc.assert(
      fc.property(USER_ID, (id) => {
        expect(
          shouldHideByRepostUser([`/${id}`], [`@${id.toUpperCase()}`]),
        ).toBe(true);
      }),
    );
  });

  it("IDが空なら任意のhrefで false になる", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (hrefs) => {
        expect(shouldHideByRepostUser(hrefs, [])).toBe(false);
      }),
    );
  });
});

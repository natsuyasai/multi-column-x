import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isExtensionsSupported,
  resolveExtensionPageAccountId,
} from "./extensionsSupport";

describe("isExtensionsSupported プロパティ", () => {
  it("モバイルなら OS 名に関わらず常に false", () => {
    fc.assert(
      fc.property(fc.string(), (platformName) => {
        expect(isExtensionsSupported(platformName, true)).toBe(false);
      }),
    );
  });

  it("windows 以外の OS 名なら常に false", () => {
    fc.assert(
      fc.property(
        fc.string().filter((name) => name !== "windows"),
        fc.boolean(),
        (platformName, isMobile) => {
          expect(isExtensionsSupported(platformName, isMobile)).toBe(false);
        },
      ),
    );
  });

  it("windows かつ非モバイルのときだけ true", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (platformName, isMobile) => {
        const supported = isExtensionsSupported(platformName, isMobile);
        if (supported) {
          expect(platformName).toBe("windows");
          expect(isMobile).toBe(false);
        }
      }),
    );
    expect(isExtensionsSupported("windows", false)).toBe(true);
  });
});

describe("resolveExtensionPageAccountId プロパティ", () => {
  const accountIds = fc.array(fc.string());
  const activeId = fc.option(fc.string(), { nil: null });

  it("結果は null か選択中のアカウントか先頭カラムのアカウントのいずれか", () => {
    fc.assert(
      fc.property(activeId, accountIds, (active, ids) => {
        const result = resolveExtensionPageAccountId(active, ids);
        const allowed: (string | null)[] = [null];
        if (active) allowed.push(active);
        if (ids[0]) allowed.push(ids[0]);
        expect(allowed).toContain(result);
      }),
    );
  });

  it("選択中のアカウントが空でなければ必ずそれが選ばれる", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), accountIds, (active, ids) => {
        expect(resolveExtensionPageAccountId(active, ids)).toBe(active);
      }),
    );
  });

  it("選択中のアカウントが無いときは先頭カラムのアカウント、それも無ければ null", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<string | null>(null, ""),
        accountIds,
        (active, ids) => {
          const result = resolveExtensionPageAccountId(active, ids);
          expect(result).toBe(ids[0] ? ids[0] : null);
        },
      ),
    );
  });

  it("結果が null でないときは空文字ではない", () => {
    fc.assert(
      fc.property(activeId, accountIds, (active, ids) => {
        const result = resolveExtensionPageAccountId(active, ids);
        if (result !== null) expect(result).not.toBe("");
      }),
    );
  });
});

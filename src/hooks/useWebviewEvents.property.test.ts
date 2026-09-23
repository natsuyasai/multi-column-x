import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pickOfficialSettingsTargetColumn } from "@/hooks/useWebviewEvents";
import type { Column, ColumnSettings, PageType } from "@/types";

const baseSettings: ColumnSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  hideHeaderEnabled: true,
  hideTweetInputEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  repostHiddenUserIds: [],
  whitelistEnabled: false,
  whitelistWords: [],
};

const pageTypeArb: fc.Arbitrary<PageType> = fc.constantFrom(
  "home",
  "notifications",
  "search",
  "list",
  "custom",
  "external",
  "compose",
);

const accountIdArb = fc.constantFrom("acc-1", "acc-2", "acc-3");

const columnArb: fc.Arbitrary<Column> = fc.record({
  id: fc.uuid(),
  accountId: accountIdArb,
  pageType: pageTypeArb,
  width: fc.constant(350),
  order: fc.nat(),
  gridRow: fc.nat(),
  gridCol: fc.nat(),
  heightMode: fc.constant("auto" as const),
  settings: fc.constant(baseSettings),
});

describe("pickOfficialSettingsTargetColumn プロパティテスト", () => {
  it("選ばれたカラムは常に指定アカウントの、compose/external 以外のカラムであること", () => {
    fc.assert(
      fc.property(fc.array(columnArb), accountIdArb, (columns, accountId) => {
        const picked = pickOfficialSettingsTargetColumn(columns, accountId);
        if (picked === undefined) return;
        expect(picked.accountId).toBe(accountId);
        expect(picked.pageType).not.toBe("compose");
        expect(picked.pageType).not.toBe("external");
      }),
    );
  });

  it("指定アカウントに compose/external 以外のカラムが1つも無い場合は undefined を返すこと", () => {
    fc.assert(
      fc.property(fc.array(columnArb), accountIdArb, (columns, accountId) => {
        const hasNormalColumn = columns.some(
          (c) =>
            c.accountId === accountId &&
            c.pageType !== "compose" &&
            c.pageType !== "external",
        );
        const picked = pickOfficialSettingsTargetColumn(columns, accountId);
        expect(picked !== undefined).toBe(hasNormalColumn);
      }),
    );
  });
});

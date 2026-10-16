import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLUMN_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
  type Column,
  type GlobalSettings,
} from "@/types";
import { columnBuildSignature } from "./columnBuildSignature";

const columnArb = fc
  .record({
    pageType: fc.constantFrom("home", "search", "list", "notifications"),
    customUrl: fc.option(fc.string(), { nil: undefined }),
    homeTabName: fc.option(fc.string(), { nil: undefined }),
    searchQuery: fc.option(fc.string(), { nil: undefined }),
    searchLiveTab: fc.option(fc.boolean(), { nil: undefined }),
    listId: fc.option(fc.string(), { nil: undefined }),
    width: fc.integer({ min: 100, max: 800 }),
    order: fc.integer({ min: 0, max: 20 }),
    gridRow: fc.integer({ min: 0, max: 5 }),
    gridCol: fc.integer({ min: 0, max: 5 }),
    label: fc.option(fc.string(), { nil: undefined }),
    blurImageEnabled: fc.boolean(),
    blurImageAmount: fc.string(),
    customCSS: fc.string(),
    ngWords: fc.array(fc.string(), { maxLength: 4 }),
  })
  .map(
    ({ blurImageEnabled, blurImageAmount, customCSS, ngWords, ...rest }) => ({
      id: "c1",
      accountId: "a1",
      heightMode: "auto",
      ...rest,
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        blurImageEnabled,
        blurImageAmount,
        customCSS,
        ngWords,
      },
    }),
  ) as fc.Arbitrary<Column>;

const globalArb = fc
  .record({
    hideAdEnabled: fc.boolean(),
    ngWords: fc.array(fc.string(), { maxLength: 4 }),
    mobileSwipeAreaHeight: fc.integer({ min: 0, max: 200 }),
  })
  .map((r) => ({
    ...DEFAULT_GLOBAL_SETTINGS,
    ...r,
  })) as fc.Arbitrary<GlobalSettings>;

type Pair = [Column, GlobalSettings];
type Mutation = (c: Column, g: GlobalSettings) => Pair;

const withSettings = (
  c: Column,
  patch: Partial<Column["settings"]>,
): Column => ({
  ...c,
  settings: { ...c.settings, ...patch },
});

// 埋め込み項目を 1 つだけ必ず別の値に変える変更
const embeddedMutations: Array<[string, Mutation]> = [
  [
    "pageType",
    (c, g) => [
      { ...c, pageType: c.pageType === "home" ? "search" : "home" },
      g,
    ],
  ],
  ["customUrl", (c, g) => [{ ...c, customUrl: `${c.customUrl ?? ""}x` }, g]],
  [
    "homeTabName",
    (c, g) => [{ ...c, homeTabName: `${c.homeTabName ?? ""}x` }, g],
  ],
  [
    "searchQuery",
    (c, g) => [{ ...c, searchQuery: `${c.searchQuery ?? ""}x` }, g],
  ],
  ["searchLiveTab", (c, g) => [{ ...c, searchLiveTab: !c.searchLiveTab }, g]],
  ["listId", (c, g) => [{ ...c, listId: `${c.listId ?? ""}x` }, g]],
  [
    "blurImageEnabled",
    (c, g) => [
      withSettings(c, { blurImageEnabled: !c.settings.blurImageEnabled }),
      g,
    ],
  ],
  [
    "blurImageAmount",
    (c, g) => [
      withSettings(c, { blurImageAmount: `${c.settings.blurImageAmount}x` }),
      g,
    ],
  ],
  [
    "customCSS",
    (c, g) => [withSettings(c, { customCSS: `${c.settings.customCSS}x` }), g],
  ],
  [
    "ngWords",
    (c, g) => [withSettings(c, { ngWords: [...c.settings.ngWords, "x"] }), g],
  ],
  [
    "global.hideAdEnabled",
    (c, g) => [c, { ...g, hideAdEnabled: !g.hideAdEnabled }],
  ],
  ["global.ngWords", (c, g) => [c, { ...g, ngWords: [...g.ngWords, "x"] }]],
  [
    "global.language",
    (c, g) => [c, { ...g, language: g.language === "ja" ? "en" : "ja" }],
  ],
];

describe("columnBuildSignature プロパティ", () => {
  it("同一入力からは常に同一の署名が得られる", () => {
    fc.assert(
      fc.property(columnArb, globalArb, (c, g) => {
        expect(columnBuildSignature(c, g)).toBe(
          columnBuildSignature(structuredClone(c), structuredClone(g)),
        );
      }),
    );
  });

  it("埋め込み項目を1つ変えると署名が変わる", () => {
    fc.assert(
      fc.property(
        columnArb,
        globalArb,
        fc.constantFrom(...embeddedMutations),
        (c, g, [name, mutate]) => {
          const [c2, g2] = mutate(c, g);
          expect(columnBuildSignature(c2, g2), `変更項目: ${name}`).not.toBe(
            columnBuildSignature(c, g),
          );
        },
      ),
    );
  });

  it("幅・並び順・グリッド位置・ラベル・自動更新間隔・テーマ・表示サイズを変えても署名は変わらない", () => {
    fc.assert(
      fc.property(
        columnArb,
        globalArb,
        fc.record({
          width: fc.integer({ min: 100, max: 800 }),
          order: fc.integer({ min: 0, max: 20 }),
          gridRow: fc.integer({ min: 0, max: 5 }),
          gridCol: fc.integer({ min: 0, max: 5 }),
          label: fc.option(fc.string(), { nil: undefined }),
          autoReloadInterval: fc.integer({ min: 1, max: 3600 }),
          theme: fc.constantFrom("dark", "light", "system"),
          uiScale: fc.constantFrom("auto", "small", "large"),
        }),
        (c, g, o) => {
          const { autoReloadInterval, theme, uiScale, ...colOverrides } = o;
          const c2 = withSettings(
            { ...c, ...colOverrides },
            { autoReloadInterval },
          );
          const g2 = { ...g, theme, uiScale } as GlobalSettings;
          expect(columnBuildSignature(c2, g2)).toBe(columnBuildSignature(c, g));
        },
      ),
    );
  });
});

// backupRestore.ts の純粋関数に対する fast-check プロパティテスト。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Column } from "@/types";
import {
  buildRestorePayload,
  canExecuteRestore,
  countRestoreSummary,
  normalizeGridPositions,
  type BackupContent,
  type RestoreMapping,
} from "./backupRestore";

const ACCOUNT_IDS = ["A", "B", "C"];
const TARGET_IDS = ["t1", "t2"];

const {
  windowBounds: _windowBounds,
  pendingDataDirectoryDeletions: _pending,
  ...portable
} = DEFAULT_GLOBAL_SETTINGS;

const columnArb: fc.Arbitrary<Column> = fc.record({
  id: fc.oneof(
    fc.constantFrom("dup", "../x", "a/b", "a\\b", ""),
    fc.string({ minLength: 0, maxLength: 6 }),
  ),
  accountId: fc.constantFrom(...ACCOUNT_IDS),
  pageType: fc.constantFrom("home", "notifications", "search", "external"),
  width: fc.constant(350),
  order: fc.integer({ min: 0, max: 20 }),
  gridRow: fc.integer({ min: 1, max: 6 }),
  gridCol: fc.integer({ min: 1, max: 10 }),
  heightMode: fc.constant("auto" as const),
  settings: fc.constant(DEFAULT_COLUMN_SETTINGS),
});

const mappingArb: fc.Arbitrary<RestoreMapping> = fc.record(
  Object.fromEntries(
    ACCOUNT_IDS.map((id) => [
      id,
      fc.constantFrom<string | null>(null, ...TARGET_IDS),
    ]),
  ),
);

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

function content(columns: Column[]): BackupContent {
  return {
    accounts: ACCOUNT_IDS.map((id) => ({
      backupAccountId: id,
      label: id,
      color: "#000",
    })),
    columns,
    globalSettings: portable,
  };
}

describe("buildRestorePayload プロパティ", () => {
  it("復元されたカラムの id は互いに重複せず、危険な文字を含まない", () => {
    fc.assert(
      fc.property(
        fc.array(columnArb, { maxLength: 15 }),
        mappingArb,
        (columns, mapping) => {
          const { columns: out } = buildRestorePayload(
            content(columns),
            mapping,
            () => crypto.randomUUID(),
          );
          const ids = out.map((c) => c.id);
          expect(new Set(ids).size).toBe(ids.length);
          for (const id of ids) {
            expect(id).not.toBe("");
            expect(id).not.toMatch(/\.\.|[\\/]/);
          }
        },
      ),
    );
  });

  it("非外部カラムは紐づけ先のアカウントだけを参照し、紐づけのないカラムは残らない", () => {
    fc.assert(
      fc.property(
        fc.array(columnArb, { maxLength: 15 }),
        mappingArb,
        (columns, mapping) => {
          const { columns: out } = buildRestorePayload(
            content(columns),
            mapping,
            counter(),
          );
          const restoredCount = out.filter(
            (c) => c.pageType !== "external",
          ).length;
          const expected = columns.filter(
            (c) => c.pageType !== "external" && mapping[c.accountId] != null,
          ).length;
          expect(restoredCount).toBe(expected);
          for (const c of out) {
            if (c.pageType === "external") {
              expect(c.accountId).toBe(c.id);
            } else {
              expect(TARGET_IDS).toContain(c.accountId);
            }
          }
        },
      ),
    );
  });

  it("復元件数は集計関数の復元件数と一致する", () => {
    fc.assert(
      fc.property(
        fc.array(columnArb, { maxLength: 15 }),
        mappingArb,
        (columns, mapping) => {
          const { columns: out } = buildRestorePayload(
            content(columns),
            mapping,
            counter(),
          );
          expect(out.length).toBe(
            countRestoreSummary(columns, mapping).restore,
          );
        },
      ),
    );
  });
});

describe("normalizeGridPositions プロパティ", () => {
  it("gridCol は 1..k の連番、order は 0..n-1 の並べ替えになる", () => {
    fc.assert(
      fc.property(fc.array(columnArb, { maxLength: 15 }), (columns) => {
        const unique = columns.map((c, i) => ({ ...c, id: `c${i}` }));
        const out = normalizeGridPositions(unique);

        const cols = [...new Set(out.map((c) => c.gridCol))].sort(
          (a, b) => a - b,
        );
        expect(cols).toEqual(cols.map((_, i) => i + 1));
        expect(out.map((c) => c.order).sort((a, b) => a - b)).toEqual(
          out.map((_, i) => i),
        );
        for (const col of cols) {
          const rows = out
            .filter((c) => c.gridCol === col)
            .map((c) => c.gridRow)
            .sort((a, b) => a - b);
          expect(rows).toEqual(rows.map((_, i) => i + 1));
        }
      }),
    );
  });
});

describe("canExecuteRestore プロパティ", () => {
  it("1 件でも紐づけがあるときだけ実行できる", () => {
    fc.assert(
      fc.property(mappingArb, (mapping) => {
        expect(canExecuteRestore(mapping)).toBe(
          Object.values(mapping).some((t) => t !== null),
        );
      }),
    );
  });
});

// return_to_last_read_logic.ts の純粋関数に対する fast-check プロパティテスト。
// status ID は重複の無い正の整数文字列として生成する。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  hasNewPostsAbove,
  reduceReturnState,
  scanReturnTarget,
  selectAnchorIds,
} from "./return_to_last_read_logic";
import type { ReturnState } from "./return_to_last_read_logic";

const idNumArb = fc.integer({ min: 1, max: 2_000_000_000 });

/** 指定 length の重複の無い status ID 配列を生成する。 */
function uniqueIdsArb(
  minLength: number,
  maxLength: number,
): fc.Arbitrary<string[]> {
  return fc
    .uniqueArray(idNumArb, { minLength, maxLength })
    .map((nums) => nums.map(String));
}

/** 互いに素な複数グループの status ID 配列を、指定サイズ通りにまとめて生成する。 */
function disjointGroupsArb(sizes: number[]): fc.Arbitrary<string[][]> {
  const total = sizes.reduce((a, b) => a + b, 0);
  return uniqueIdsArb(total, total).map((ids) => {
    const groups: string[][] = [];
    let offset = 0;
    for (const size of sizes) {
      groups.push(ids.slice(offset, offset + size));
      offset += size;
    }
    return groups;
  });
}

describe("scanReturnTarget プロパティ", () => {
  // 性質1: 新着列(news, 基準と素) + 基準の順序を保った部分列(kept, 長さ2以上) + 残り(rest, 基準と素)
  // を連結した ids に対しては、必ず { kind: "run", id: kept[0] } になる。
  it("news+kept+restを連結したidsでは先頭のkept[0]がrunとして見つかる", () => {
    const scenarioArb = fc.integer({ min: 2, max: 8 }).chain((anchorLen) =>
      fc.integer({ min: 0, max: 5 }).chain((newsLen) =>
        fc.integer({ min: 0, max: 5 }).chain((restLen) =>
          disjointGroupsArb([anchorLen, newsLen, restLen]).chain(
            ([anchorIds, news, rest]) =>
              fc
                .subarray(anchorIds, {
                  minLength: 2,
                  maxLength: anchorIds.length,
                })
                .map((kept) => ({ anchorIds, news, rest, kept })),
          ),
        ),
      ),
    );

    fc.assert(
      fc.property(scenarioArb, ({ anchorIds, news, rest, kept }) => {
        const ids = [...news, ...kept, ...rest];
        const result = scanReturnTarget(ids, anchorIds);
        expect(result).toEqual({ kind: "run", id: kept[0] });
      }),
    );
  });

  // 任意の ids・anchorIds に対する generic なシナリオ（run / none どちらも起こりうる）。
  // 8件の基準候補 vocab のサブセットを基準にし、ids はさらに素なidを混ぜた語彙からの重複ありの列にする。
  const genericScanScenarioArb = disjointGroupsArb([8, 4]).chain(
    ([vocab, extra]) =>
      fc
        .shuffledSubarray(vocab, { minLength: 0, maxLength: vocab.length })
        .chain((anchorIds) =>
          fc
            .array(fc.constantFrom(...vocab, ...extra), {
              minLength: 0,
              maxLength: 15,
            })
            .map((ids) => ({ ids, anchorIds })),
        ),
  );

  // 性質2: 結果が run のとき、返した id は ids 内にあり、その直後の要素は
  // 基準内でより後ろの基準 ID である。
  it("結果がrunのとき、返したidの直後の要素は基準内でより後ろの基準IDである", () => {
    fc.assert(
      fc.property(genericScanScenarioArb, ({ ids, anchorIds }) => {
        const result = scanReturnTarget(ids, anchorIds);
        if (result.kind !== "run") return;

        const returnedIndex = anchorIds.indexOf(result.id);
        expect(returnedIndex).not.toBe(-1);

        const satisfied = ids.some((id, i) => {
          if (id !== result.id) return false;
          const next = ids[i + 1];
          if (next === undefined) return false;
          const nextIndex = anchorIds.indexOf(next);
          return nextIndex !== -1 && nextIndex > returnedIndex;
        });
        expect(satisfied).toBe(true);
      }),
    );
  });

  // 性質3: 結果が none のとき、singles は ids の中で基準に含まれるものを
  // 出現順に並べたものと一致する。
  it("結果がnoneのとき、singlesはidsの中で基準に含まれるものを出現順に並べたものと一致する", () => {
    fc.assert(
      fc.property(genericScanScenarioArb, ({ ids, anchorIds }) => {
        const result = scanReturnTarget(ids, anchorIds);
        if (result.kind !== "none") return;

        const expected = ids.filter((id) => anchorIds.includes(id));
        expect(result.singles).toEqual(expected);
      }),
    );
  });
});

describe("hasNewPostsAbove プロパティ", () => {
  // 性質4-a: 先頭が基準の順序を保った部分列（長さ2以上）で始まる topIds なら false。
  it("先頭が基準の順序を保った部分列で始まるtopIdsはfalseになる", () => {
    const scenarioArb = uniqueIdsArb(2, 8).chain((anchorIds) =>
      fc
        .subarray(anchorIds, { minLength: 2, maxLength: anchorIds.length })
        .chain((kept) =>
          fc
            .array(fc.string(), { minLength: 0, maxLength: 5 })
            .map((tail) => ({ anchorIds, topIds: [...kept, ...tail] })),
        ),
    );

    fc.assert(
      fc.property(scenarioArb, ({ anchorIds, topIds }) => {
        expect(hasNewPostsAbove(topIds, anchorIds)).toBe(false);
      }),
    );
  });

  // 性質4-b: 基準と素な ID が先頭にあれば true。
  it("基準と素なIDが先頭にあればtrueになる", () => {
    const scenarioArb = fc.integer({ min: 1, max: 8 }).chain((anchorLen) =>
      disjointGroupsArb([anchorLen, 1]).chain(([anchorIds, fresh]) =>
        fc.array(fc.string(), { minLength: 0, maxLength: 5 }).map((tail) => ({
          anchorIds,
          topIds: [fresh[0], ...tail],
        })),
      ),
    );

    fc.assert(
      fc.property(scenarioArb, ({ anchorIds, topIds }) => {
        expect(hasNewPostsAbove(topIds, anchorIds)).toBe(true);
      }),
    );
  });
});

describe("selectAnchorIds プロパティ", () => {
  // 性質5: 結果は入力の接頭辞で、長さは min(len, max)。
  it("結果は入力の接頭辞であり、長さはmin(len, max)である", () => {
    fc.assert(
      fc.property(
        uniqueIdsArb(0, 15),
        fc.integer({ min: 0, max: 12 }),
        (ids, max) => {
          const result = selectAnchorIds(ids, max);
          expect(result.length).toBe(Math.min(ids.length, max));
          expect(ids.slice(0, result.length)).toEqual(result);
        },
      ),
    );
  });
});

describe("reduceReturnState プロパティ", () => {
  // 性質6: 基準が未消化（anchorIds 非 null・consumed false）の状態に、
  // 任意の snapshot の reload を与えても anchorIds は変わらない。
  it("基準が未消化の状態にreloadを与えてもanchorIdsは変わらない", () => {
    const stateArb: fc.Arbitrary<ReturnState> = fc.record({
      anchorIds: uniqueIdsArb(0, 6),
      tabName: fc.option(fc.string(), { nil: null }),
      consumed: fc.constant(false),
      buttonVisible: fc.boolean(),
    });

    fc.assert(
      fc.property(
        stateArb,
        fc.array(fc.string(), { minLength: 0, maxLength: 6 }),
        fc.option(fc.string(), { nil: null }),
        (state, snapshot, eventTabName) => {
          const next = reduceReturnState(state, {
            type: "reload",
            snapshot,
            tabName: eventTabName,
          });
          expect(next.anchorIds).toEqual(state.anchorIds);
        },
      ),
    );
  });
});

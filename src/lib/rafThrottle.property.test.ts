import fc from "fast-check";
import { describe, it, vi, beforeEach, afterEach, expect } from "vitest";
import { rafThrottle } from "./rafThrottle";

describe("rafThrottle プロパティ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("各フレームで呼び出されるのは高々1回であり、空バーストでは呼ばれない", () => {
    fc.assert(
      fc.property(
        // 各バースト = そのフレーム内での呼び出し引数の列（空もあり得る）
        fc.array(fc.array(fc.integer()), { minLength: 1, maxLength: 12 }),
        (bursts) => {
          const fn = vi.fn();
          const throttled = rafThrottle(fn);

          let expectedCalls = 0;
          for (const burst of bursts) {
            for (const arg of burst) throttled(arg);
            vi.advanceTimersToNextFrame();

            if (burst.length > 0) {
              // 非空バーストはフレーム消化で必ず1回だけ増える
              expectedCalls += 1;
              // 実行時の引数は常にバースト内の最後の値
              expect(fn).toHaveBeenLastCalledWith(burst[burst.length - 1]);
            }
            // 累積呼び出し回数は「非空だったバーストの数」に一致する
            expect(fn).toHaveBeenCalledTimes(expectedCalls);
          }
        },
      ),
    );
  });
});

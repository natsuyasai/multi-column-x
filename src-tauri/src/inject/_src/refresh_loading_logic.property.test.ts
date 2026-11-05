// refresh_loading_logic.ts の純粋関数に対する fast-check プロパティテスト。
// 状態遷移はイベント列（startLoading / requestStarted / requestFinished）として生成し、
// 時刻は単調増加する数列、取得 id は小さい整数（衝突させて開始・完了の組み合わせを増やす）にする。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  INITIAL_LOADING_STATE,
  MAX_DISPLAY_MS,
  evaluate,
  isTimelineRequestUrl,
  requestFinished,
  requestStarted,
  startLoading,
} from "./refresh_loading_logic";
import type { LoadingState } from "./refresh_loading_logic";

type LoadingEvent =
  | { kind: "started"; id: number }
  | { kind: "finished"; id: number };

const idArb = fc.integer({ min: 0, max: 5 });

const eventArb: fc.Arbitrary<LoadingEvent> = fc.oneof(
  idArb.map((id): LoadingEvent => ({ kind: "started", id })),
  idArb.map((id): LoadingEvent => ({ kind: "finished", id })),
);

const eventsArb = fc.array(eventArb, { maxLength: 30 });

function applyEvent(state: LoadingState, event: LoadingEvent): LoadingState {
  return event.kind === "started"
    ? requestStarted(state, event.id)
    : requestFinished(state, event.id);
}

function applyEvents(
  state: LoadingState,
  events: readonly LoadingEvent[],
): LoadingState {
  return events.reduce(applyEvent, state);
}

describe("refresh_loading_logic のプロパティ", () => {
  describe("上限時間", () => {
    it("開始から上限以上経てば、取得の開始・完了がどんな列でも必ず非表示になる", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 0, max: 1_000_000 }),
          eventsArb,
          (startedAt, extra, events) => {
            const started = startLoading(
              INITIAL_LOADING_STATE,
              startedAt,
              "/home",
            );
            const state = applyEvents(started, events);
            const result = evaluate(
              state,
              startedAt + MAX_DISPLAY_MS + extra,
              "/home",
            );
            expect(result).toBe(INITIAL_LOADING_STATE);
          },
        ),
      );
    });

    it("未完了の取得が残っていても、上限に達すれば消える", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          idArb,
          eventsArb,
          (startedAt, id, events) => {
            const started = startLoading(
              INITIAL_LOADING_STATE,
              startedAt,
              "/home",
            );
            // 必ず未完了の取得が1件残る状態にする
            const withPending = requestStarted(
              applyEvents(started, events),
              id,
            );
            expect(withPending.pending.size).toBeGreaterThan(0);
            const result = evaluate(
              withPending,
              startedAt + MAX_DISPLAY_MS,
              "/home",
            );
            expect(result).toBe(INITIAL_LOADING_STATE);
          },
        ),
      );
    });

    it("上限未満・path 不変・未完了の取得ありの間は消えずに継続する", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 0, max: MAX_DISPLAY_MS - 1 }),
          idArb,
          eventsArb,
          (startedAt, elapsed, id, events) => {
            const started = startLoading(
              INITIAL_LOADING_STATE,
              startedAt,
              "/home",
            );
            const withPending = requestStarted(
              applyEvents(started, events),
              id,
            );
            const result = evaluate(withPending, startedAt + elapsed, "/home");
            expect(result).toBe(withPending);
            expect(result.active).toBe(true);
          },
        ),
      );
    });
  });

  describe("冪等性", () => {
    it("同じ時刻・path で evaluate を2回呼んでも結果は1回目と同じ", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000 }),
          eventsArb,
          fc.integer({ min: 0, max: 30_000 }),
          fc.constantFrom("/home", "/notifications"),
          (startedAt, events, elapsed, nowPath) => {
            const state = applyEvents(
              startLoading(INITIAL_LOADING_STATE, startedAt, "/home"),
              events,
            );
            const now = startedAt + elapsed;
            const once = evaluate(state, now, nowPath);
            const twice = evaluate(once, now, nowPath);
            expect(twice).toEqual(once);
          },
        ),
      );
    });

    it("消えた状態に evaluate・取得の開始・完了を適用しても変わらない", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000 }),
          fc.constantFrom("/home", "/notifications"),
          eventsArb,
          (now, path, events) => {
            expect(evaluate(INITIAL_LOADING_STATE, now, path)).toBe(
              INITIAL_LOADING_STATE,
            );
            expect(applyEvents(INITIAL_LOADING_STATE, events)).toBe(
              INITIAL_LOADING_STATE,
            );
          },
        ),
      );
    });
  });

  describe("pending の整合性", () => {
    it("任意順で開始・完了を適用しても、pending は開始済みで未完了の id だけになる", () => {
      fc.assert(
        fc.property(eventsArb, (events) => {
          let state = startLoading(INITIAL_LOADING_STATE, 0, "/home");
          const expected = new Set<number>();
          const everStarted = new Set<number>();
          for (const event of events) {
            state = applyEvent(state, event);
            if (event.kind === "started") {
              expected.add(event.id);
              everStarted.add(event.id);
            } else {
              expected.delete(event.id);
            }
            expect(new Set(state.pending)).toEqual(expected);
            for (const id of state.pending) {
              expect(everStarted.has(id)).toBe(true);
            }
          }
        }),
      );
    });
  });

  describe("不変性", () => {
    it("各関数を適用しても、元の状態の pending は変更されない", () => {
      fc.assert(
        fc.property(
          eventsArb,
          idArb,
          fc.integer({ min: 0, max: 30_000 }),
          (events, id, now) => {
            const state = applyEvents(
              startLoading(INITIAL_LOADING_STATE, 0, "/home"),
              events,
            );
            const before = [...state.pending];
            const beforeSeen = state.seen;

            requestStarted(state, id);
            requestFinished(state, id);
            evaluate(state, now, "/home");
            evaluate(state, now, "/notifications");
            startLoading(state, now, "/home");

            expect([...state.pending]).toEqual(before);
            expect(state.seen).toBe(beforeSeen);
            expect(state.active).toBe(true);
          },
        ),
      );
    });
  });

  describe("タイムライン取得の URL 判定", () => {
    const hashArb = fc.stringMatching(/^[A-Za-z0-9_-]{1,22}$/);
    const queryArb = fc.oneof(
      fc.constant(""),
      fc.stringMatching(/^[A-Za-z0-9=&%_.-]{0,40}$/).map((q) => `?${q}`),
    );

    it("GraphQL の <hash>/<英字>Timeline 形式なら、クエリ文字列の有無によらず常に true", () => {
      fc.assert(
        fc.property(
          hashArb,
          fc.stringMatching(/^[A-Za-z]{0,12}$/),
          queryArb,
          (hash, prefix, query) => {
            const url = `https://x.com/i/api/graphql/${hash}/${prefix}Timeline${query}`;
            expect(isTimelineRequestUrl(url)).toBe(true);
          },
        ),
      );
    });

    it("Timeline の直後に英数字が続く名前（例: HomeTimelineUrt）は false", () => {
      fc.assert(
        fc.property(
          hashArb,
          fc.stringMatching(/^[A-Za-z]{0,12}$/),
          fc.stringMatching(/^[A-Za-z0-9]{1,8}$/),
          (hash, prefix, suffix) => {
            const url = `https://x.com/i/api/graphql/${hash}/${prefix}Timeline${suffix}`;
            expect(isTimelineRequestUrl(url)).toBe(false);
          },
        ),
      );
    });

    it("GraphQL 以外の URL（/graphql/<hash>/ を含まないパス）は常に false", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Za-z0-9_./-]{0,40}$/),
          fc.constantFrom(
            "flow/timeline.json",
            "viewer_context.json",
            "Timeline",
          ),
          queryArb,
          (dir, file, query) => {
            fc.pre(!dir.includes("/graphql/"));
            const url = `https://x.com/i/api/${dir}/${file}${query}`;
            expect(url).not.toContain("/graphql/");
            expect(isTimelineRequestUrl(url)).toBe(false);
          },
        ),
      );
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  INITIAL_LOADING_STATE,
  MAX_DISPLAY_MS,
  MIN_DISPLAY_MS,
  START_WAIT_MS,
  evaluate,
  isTimelineRequestUrl,
  requestFinished,
  requestStarted,
  startLoading,
} from "./refresh_loading_logic";

const PATH = "/home";

describe("更新ローディングの状態遷移", () => {
  describe("取得中に再度手動更新を行ってもバーは1本のままで消える時刻が延長される", () => {
    it("再更新で startedAt が更新され、取得が始まっていなければ時間切れ計測が数え直される", () => {
      const first = startLoading(INITIAL_LOADING_STATE, 1000, PATH);
      const second = startLoading(first, 2000, PATH);

      expect(second.active).toBe(true);
      expect(second.startedAt).toBe(2000);
      // 最初の更新から1500ms後でも、再更新から数え直しているので継続
      expect(evaluate(second, 1000 + START_WAIT_MS, PATH).active).toBe(true);
      expect(evaluate(second, 2000 + START_WAIT_MS, PATH).active).toBe(false);
    });

    it("再更新時に未完了の取得が残っていれば引き継ぎ、完了するまで消えない", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 1000, PATH);
      state = requestStarted(state, 1);
      state = startLoading(state, 2000, PATH);

      expect(state.pending.has(1)).toBe(true);
      expect(state.seen).toBe(true);
      expect(evaluate(state, 2000 + MIN_DISPLAY_MS, PATH).active).toBe(true);
    });

    it("再更新時に取得がすべて完了済みなら seen を数え直す", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 1000, PATH);
      state = requestStarted(state, 1);
      state = requestFinished(state, 1);
      state = startLoading(state, 1100, PATH);

      expect(state.seen).toBe(false);
      expect(state.pending.size).toBe(0);
    });
  });

  describe("タイムライン取得が完了するとローディングバーが消える", () => {
    it("開始済みの取得が完了し、最低表示時間が経過したら消える", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 0, PATH);
      state = requestStarted(state, 1);
      state = requestFinished(state, 1);

      expect(evaluate(state, 700, PATH)).toBe(INITIAL_LOADING_STATE);
    });

    it("取得が未完了のうちは消えない", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 0, PATH);
      state = requestStarted(state, 1);

      expect(evaluate(state, 5000, PATH).active).toBe(true);
    });
  });

  describe("複数のタイムライン取得が進行中のときはすべて完了するまでバーが消えない", () => {
    it("一部が完了しても残りが進行中なら表示を続け、全部完了で消える", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 0, PATH);
      state = requestStarted(state, 1);
      state = requestStarted(state, 2);
      state = requestFinished(state, 1);

      expect(evaluate(state, 1000, PATH).active).toBe(true);

      state = requestFinished(state, 2);
      expect(evaluate(state, 1000, PATH).active).toBe(false);
    });
  });

  describe("取得が一瞬で終わっても最低表示時間はバーが表示される", () => {
    it("最低表示時間の1ms前は表示を続け、ちょうどで消える", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 0, PATH);
      state = requestStarted(state, 1);
      state = requestFinished(state, 1);

      expect(evaluate(state, MIN_DISPLAY_MS - 1, PATH).active).toBe(true);
      expect(evaluate(state, MIN_DISPLAY_MS, PATH).active).toBe(false);
    });
  });

  describe("更新から1.5秒経ってもタイムライン取得が始まらなければバーが消える", () => {
    it("1499ms では表示を続け、1500ms で消える", () => {
      const state = startLoading(INITIAL_LOADING_STATE, 0, PATH);

      expect(evaluate(state, START_WAIT_MS - 1, PATH).active).toBe(true);
      expect(evaluate(state, START_WAIT_MS, PATH).active).toBe(false);
    });
  });

  describe("タイムライン取得が15秒経っても完了しなければバーが消える", () => {
    it("14999ms では表示を続け、15000ms で消える", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 0, PATH);
      state = requestStarted(state, 1);

      expect(evaluate(state, MAX_DISPLAY_MS - 1, PATH).active).toBe(true);
      expect(evaluate(state, MAX_DISPLAY_MS, PATH).active).toBe(false);
    });
  });

  describe("タイムライン以外の通信ではバーの表示は変わらない", () => {
    it("GraphQL の *Timeline は対象になる", () => {
      expect(isTimelineRequestUrl("/i/api/graphql/abc/HomeTimeline")).toBe(
        true,
      );
      expect(
        isTimelineRequestUrl(
          "https://x.com/i/api/graphql/abc123/ListLatestTweetsTimeline?variables=%7B%7D",
        ),
      ).toBe(true);
      expect(
        isTimelineRequestUrl("/i/api/graphql/abc/SearchTimeline?variables=1"),
      ).toBe(true);
    });

    it("定期ポーリングや無関係な通信は対象外になる", () => {
      expect(isTimelineRequestUrl("/i/api/1.1/jot/client_event.json")).toBe(
        false,
      );
      expect(
        isTimelineRequestUrl("/i/api/2/notifications/flow/timeline.json"),
      ).toBe(false);
      expect(isTimelineRequestUrl("/i/api/1.1/viewer_context.json")).toBe(
        false,
      );
      expect(isTimelineRequestUrl("/i/api/graphql/abc/ViewerBadgeCounts")).toBe(
        false,
      );
    });
  });

  describe("手動更新の前から進行中だった取得の完了ではバーは消えない", () => {
    it("開始前に始まった取得は追跡されず、その完了で状態は変わらない", () => {
      let state = requestStarted(INITIAL_LOADING_STATE, 1);
      expect(state).toBe(INITIAL_LOADING_STATE);

      state = startLoading(state, 0, PATH);
      const afterFinish = requestFinished(state, 1);

      expect(afterFinish).toBe(state);
      expect(afterFinish.active).toBe(true);
      expect(afterFinish.seen).toBe(false);
    });
  });

  describe("ローディングバー表示中にページが切り替わっても残らない", () => {
    it("path が変わると取得中でも消える", () => {
      let state = startLoading(INITIAL_LOADING_STATE, 0, PATH);
      state = requestStarted(state, 1);

      expect(evaluate(state, 100, PATH).active).toBe(true);
      expect(evaluate(state, 100, "/notifications")).toBe(
        INITIAL_LOADING_STATE,
      );
    });
  });
});

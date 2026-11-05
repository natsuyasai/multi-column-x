import { afterEach, describe, expect, it } from "vitest";

import {
  INITIAL_LOADING_STATE,
  MAX_DISPLAY_MS,
  MIN_DISPLAY_MS,
  START_WAIT_MS,
  evaluate,
  isEditableKeyTarget,
  isLoadingRefreshClickTarget,
  isLoadingRefreshShortcut,
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

describe("X 自身の更新操作の判定", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function addTab(selected: boolean, expanded = false): HTMLElement {
    const tab = document.createElement("div");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(selected));
    if (expanded) tab.setAttribute("aria-expanded", "false");
    const label = document.createElement("span");
    tab.appendChild(label);
    document.body.appendChild(tab);
    return label;
  }

  function addSection(): HTMLElement {
    const section = document.createElement("section");
    section.setAttribute("aria-labelledby", "timeline");
    document.body.appendChild(section);
    return section;
  }

  function addButtonCell(
    parent: HTMLElement,
    options: { article?: boolean; userCell?: boolean } = {},
  ): HTMLButtonElement {
    const cell = document.createElement("div");
    cell.dataset.testid = "cellInnerDiv";
    if (options.article) cell.appendChild(document.createElement("article"));
    const button = document.createElement("button");
    button.type = "button";
    if (options.userCell) button.dataset.testid = "UserCell";
    cell.appendChild(button);
    parent.appendChild(cell);
    return button;
  }

  function keyEvent(
    key: string,
    target: EventTarget | null,
    modifiers: Partial<
      Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>
    > = {},
  ) {
    return {
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target,
      ...modifiers,
    };
  }

  describe("isLoadingRefreshClickTarget", () => {
    it("選択中のタブ名（内側の要素を含む）は更新操作と判定される", () => {
      expect(isLoadingRefreshClickTarget(addTab(true))).toBe(true);
    });

    it("選択中でないタブは更新操作と判定されない", () => {
      expect(isLoadingRefreshClickTarget(addTab(false))).toBe(false);
    });

    it("メニューが開くタイプ（aria-expanded を持つ）のタブは更新操作と判定されない", () => {
      expect(isLoadingRefreshClickTarget(addTab(true, true))).toBe(false);
    });

    it("タイムラインの新着ポストのボタンは更新操作と判定される", () => {
      const button = addButtonCell(addSection());
      expect(isLoadingRefreshClickTarget(button)).toBe(true);
    });

    it("ポストを含むセル内のボタンは更新操作と判定されない", () => {
      const button = addButtonCell(addSection(), { article: true });
      expect(isLoadingRefreshClickTarget(button)).toBe(false);
    });

    it("UserCell のボタンは更新操作と判定されない", () => {
      const button = addButtonCell(addSection(), { userCell: true });
      expect(isLoadingRefreshClickTarget(button)).toBe(false);
    });

    it("タイムライン（section）の外のセルのボタンは更新操作と判定されない", () => {
      const button = addButtonCell(document.body);
      expect(isLoadingRefreshClickTarget(button)).toBe(false);
    });

    it("セルに入っていないボタンやボタン以外の要素は更新操作と判定されない", () => {
      const section = addSection();
      const lone = document.createElement("button");
      lone.type = "button";
      section.appendChild(lone);
      const div = document.createElement("div");
      section.appendChild(div);
      expect(isLoadingRefreshClickTarget(lone)).toBe(false);
      expect(isLoadingRefreshClickTarget(div)).toBe(false);
    });

    it("Element でない対象は更新操作と判定されない", () => {
      expect(isLoadingRefreshClickTarget(null)).toBe(false);
      expect(isLoadingRefreshClickTarget(document)).toBe(false);
    });
  });

  describe("isLoadingRefreshShortcut", () => {
    it("入力欄以外での「.」キーは更新操作と判定される", () => {
      expect(isLoadingRefreshShortcut(keyEvent(".", document.body))).toBe(true);
    });

    it("「.」以外のキーは更新操作と判定されない", () => {
      expect(isLoadingRefreshShortcut(keyEvent("j", document.body))).toBe(
        false,
      );
    });

    it("修飾キー付きの「.」キーは更新操作と判定されない", () => {
      for (const mod of ["ctrlKey", "metaKey", "altKey", "shiftKey"] as const) {
        expect(
          isLoadingRefreshShortcut(
            keyEvent(".", document.body, { [mod]: true }),
          ),
        ).toBe(false);
      }
    });

    it("入力欄にフォーカスがあるときの「.」キーは更新操作と判定されない", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      expect(isLoadingRefreshShortcut(keyEvent(".", input))).toBe(false);
    });
  });

  describe("isEditableKeyTarget", () => {
    it("input・textarea・select・contenteditable・role=textbox は入力欄と判定される", () => {
      const html = [
        "<input>",
        "<textarea></textarea>",
        "<select></select>",
        '<div contenteditable=""></div>',
        '<div contenteditable="true"></div>',
        '<div role="textbox"></div>',
      ];
      for (const h of html) {
        document.body.innerHTML = h;
        expect(isEditableKeyTarget(document.body.firstElementChild)).toBe(true);
      }
    });

    it("入力欄の内側の要素も入力欄と判定される", () => {
      document.body.innerHTML = '<div role="textbox"><span></span></div>';
      expect(isEditableKeyTarget(document.querySelector("span"))).toBe(true);
    });

    it("通常の要素と Element でない対象は入力欄と判定されない", () => {
      document.body.innerHTML = '<div contenteditable="false"></div>';
      expect(isEditableKeyTarget(document.body.firstElementChild)).toBe(false);
      expect(isEditableKeyTarget(null)).toBe(false);
    });
  });
});

// @vitest-environment-options { "url": "https://x.com/compose/post" }
//
// post_page_lock.ts は IIFE のため import 時に実行され、history.pushState /
// replaceState / popstate / ポーリングで投稿ページ（/compose/post）以外への
// 遷移を監視する副作用を登録する。
//
// 投稿ボタン押下後、X は投稿完了時に /home へ pushState し、直後に
// 「ポストを送信しました。」トースト（[data-testid="toast"]）を表示する。
// 完了前（進捗バー [role="progressbar"] 表示中）に即リロードすると投稿が
// 中断されるため、遷移検知後は完了トーストを待ち、さらに検知直後は早すぎる
// ため一定時間（TOAST_SETTLE_DELAY_MS）待ってから投稿ページへ戻す。
//
// window.location.assign は Unforgeable なため、実ナビゲーションは
// window.__multiColumnX.postPageLockNavigate 経由にしてテストで検証する。
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";

const COMPOSE_URL = "https://x.com/compose/post";

// 完了トースト検知後、戻すまでの待機（実装の TOAST_SETTLE_DELAY_MS と一致）。
const TOAST_SETTLE_DELAY_MS = 1000;

function setSending(): void {
  document.body.innerHTML = '<div role="progressbar"></div>';
}

function setToast(): void {
  document.body.innerHTML =
    '<div data-testid="toast">ポストを送信しました。</div>';
}

function clearDom(): void {
  document.body.innerHTML = "";
}

describe("inject/post_page_lock", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    await import("./post_page_lock");
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // 投稿ページへ戻して監視/復帰予約タイマーを停止（enforceLock が isComposePage で stopWatch）。
    history.replaceState({}, "", "/compose/post");
    clearDom();
    window.__multiColumnX.postPageLockNavigate = vi.fn();
    // アイドルな投稿ページ状態で 500ms ポーリングを1周し postWasSending をリセット。
    vi.advanceTimersByTime(500);
    window.__multiColumnX.postPageLockNavigate = vi.fn();
  });

  it("投稿送信中は遷移が起きずまだ投稿ページへ戻さない", () => {
    setSending();
    vi.advanceTimersByTime(1000);

    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();
  });

  it("投稿送信後、完了トーストが出るまでは投稿ページへ戻さない", () => {
    setSending();
    vi.advanceTimersByTime(500); // 送信済みフラグを立てる

    clearDom();
    history.pushState({}, "", "/home"); // 完了遷移（トーストはまだ無い）
    vi.advanceTimersByTime(1000); // 猶予(450ms)を超えても戻さない

    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();
  });

  it("完了トースト検知後は即座には戻さず、一定時間待ってから投稿ページへ戻す", () => {
    setSending();
    vi.advanceTimersByTime(500);

    clearDom();
    history.pushState({}, "", "/home");
    vi.advanceTimersByTime(1000);
    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();

    setToast(); // 「ポストを送信しました。」出現
    vi.advanceTimersByTime(200); // 検知はするが即時には戻さない
    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TOAST_SETTLE_DELAY_MS); // 検知後の待機を経て戻す
    expect(window.__multiColumnX.postPageLockNavigate).toHaveBeenCalledWith(
      COMPOSE_URL,
    );
  });

  it("トースト検知後の待機中に投稿ページへ戻ったら戻さない", () => {
    setSending();
    vi.advanceTimersByTime(500);

    clearDom();
    history.pushState({}, "", "/home");
    setToast();
    vi.advanceTimersByTime(200); // トースト検知 → 復帰を予約

    // 待機中にユーザーが投稿ページへ戻る
    clearDom();
    history.pushState({}, "", "/compose/post");
    vi.advanceTimersByTime(TOAST_SETTLE_DELAY_MS + 500);

    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();
  });

  it("送信を伴わない遷移は猶予後に投稿ページへ戻す", () => {
    history.pushState({}, "", "/home"); // 送信フラグ無し・トースト無し
    vi.advanceTimersByTime(600); // 猶予(450ms)後に戻す

    expect(window.__multiColumnX.postPageLockNavigate).toHaveBeenCalledWith(
      COMPOSE_URL,
    );
  });

  it("投稿ページ内のpushStateでは戻さない", () => {
    history.pushState({}, "", "/compose/post");
    vi.advanceTimersByTime(1000);

    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();
  });

  it("監視中に投稿ページへ戻ったら戻す動作をしない", () => {
    history.pushState({}, "", "/home");
    history.pushState({}, "", "/compose/post"); // すぐ投稿ページへ戻る
    vi.advanceTimersByTime(1000);

    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();
  });

  it("遷移後に完了トーストを検知したら待機を経て投稿ページへ戻す(popstate含む)", () => {
    history.replaceState({}, "", "/home");
    setToast();
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.advanceTimersByTime(200 + TOAST_SETTLE_DELAY_MS);

    expect(window.__multiColumnX.postPageLockNavigate).toHaveBeenCalledWith(
      COMPOSE_URL,
    );
  });
});

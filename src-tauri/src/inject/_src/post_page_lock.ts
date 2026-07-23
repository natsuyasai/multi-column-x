(function () {
  const COMPOSE_URL = "https://x.com/compose/post";
  const COMPOSE_PATH = "/compose/post";

  window.__multiColumnX =
    window.__multiColumnX || ({} as MultiColumnXAPI);

  // window.location.assign は WebIDL 上 Unforgeable なプロパティであり、
  // テスト（jsdom）でも実ブラウザでも直接 spy/monkeypatch できない。
  // window.__multiColumnX 経由の間接呼び出しにすることで、
  // テストから「投稿ページへ戻す呼び出しが行われたか」を検証できるようにする。
  // 既に注入済み（他のカラムの init script 経由等）なら上書きしない。
  if (!window.__multiColumnX.postPageLockNavigate) {
    window.__multiColumnX.postPageLockNavigate = (url: string) => {
      window.location.assign(url);
    };
  }

  function isComposePage(): boolean {
    return window.location.pathname === COMPOSE_PATH;
  }

  function enforceLock(): void {
    if (isComposePage()) return;
    // 投稿ページ以外へ遷移した → 即座に投稿ページへ戻す
    window.__multiColumnX.postPageLockNavigate?.(COMPOSE_URL);
  }

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(history, args);
    enforceLock();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);
    enforceLock();
  };

  window.addEventListener("popstate", () => {
    enforceLock();
  });

  // History API を介さない遷移（meta refresh 等）の保険としてポーリングも行う
  let previousHref = window.location.href;
  setInterval(() => {
    const currentHref = window.location.href;
    if (currentHref !== previousHref) {
      previousHref = currentHref;
      enforceLock();
    }
  }, 500);
})();

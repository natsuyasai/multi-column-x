(function () {
  const COMPOSE_URL = "https://x.com/compose/post";
  const COMPOSE_PATH = "/compose/post";
  // 遷移検知後のポーリング間隔。
  const WATCH_POLL_MS = 150;
  // 送信を伴わない遷移（コンポーザーを閉じた等）でトーストが出ない場合の猶予。
  const PLAIN_NAV_GRACE_MS = 450;
  // 投稿送信済み判定なのに完了トーストが出ないままのフォールバック上限。
  const POST_TOAST_MAX_WAIT_MS = 5000;
  // 完了トースト検知後、投稿ページへ戻すまでの待機（検知直後だと遷移が早すぎるため）。
  const TOAST_SETTLE_DELAY_MS = 1000;

  window.__multiColumnX = window.__multiColumnX || ({} as MultiColumnXAPI);

  // window.location.assign は WebIDL 上 Unforgeable なプロパティであり、
  // テスト（jsdom）でも実ブラウザでも直接 spy/monkeypatch できない。
  // window.__multiColumnX 経由の間接呼び出しにすることで、
  // テストから「投稿ページへ戻す呼び出しが行われたか」を検証できるようにする。
  if (!window.__multiColumnX.postPageLockNavigate) {
    window.__multiColumnX.postPageLockNavigate = (url: string) => {
      window.location.assign(url);
    };
  }

  function isComposePage(): boolean {
    return window.location.pathname === COMPOSE_PATH;
  }

  // 投稿送信中インジケータ（進捗バー）。投稿ページ上では投稿送信中を意味する。
  // 遷移先（/home 等）ではタイムライン読込スピナーとして多数出現するため、
  // 「投稿由来か」は投稿ページ上で観測したかどうかで判定する。
  function hasSendingIndicator(): boolean {
    return !!document.querySelector('[role="progressbar"]');
  }

  // 投稿完了トースト（例:「ポストを送信しました。」）。
  // 文言はロケール依存のため presence（data-testid）で判定する。
  function hasPostSentToast(): boolean {
    return !!document.querySelector('[data-testid="toast"]');
  }

  // 投稿ページ上で送信インジケータを観測したら「投稿送信中/済み」とみなす。
  // 投稿ページ上で送信中でないアイドル状態なら解除する（添付アップロード等の
  // 進捗バーが残した誤検知をリセットするため）。
  let postWasSending = false;
  function syncSendingState(): void {
    if (!isComposePage()) return;
    postWasSending = hasSendingIndicator();
  }

  let watchTimer: ReturnType<typeof setInterval> | null = null;
  let watchWaited = 0;
  // 完了トースト検知後の遅延復帰タイマー。
  let returnTimer: ReturnType<typeof setTimeout> | null = null;

  function stopWatch(): void {
    if (watchTimer !== null) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    if (returnTimer !== null) {
      clearTimeout(returnTimer);
      returnTimer = null;
    }
    watchWaited = 0;
  }

  function returnToCompose(): void {
    stopWatch();
    postWasSending = false;
    window.__multiColumnX.postPageLockNavigate?.(COMPOSE_URL);
  }

  // 完了トーストを検知したら、監視ポーリングは止めつつ TOAST_SETTLE_DELAY_MS
  // だけ待ってから投稿ページへ戻す。検知直後の遷移は早すぎるため。
  // 待機中に投稿ページへ戻っていたら復帰はキャンセルする。
  function scheduleReturnAfterToast(): void {
    if (watchTimer !== null) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    watchWaited = 0;
    if (returnTimer !== null) return; // 既に復帰予約済み
    returnTimer = setTimeout(() => {
      returnTimer = null;
      if (isComposePage()) return; // 待機中に投稿ページへ戻っていたら何もしない
      returnToCompose();
    }, TOAST_SETTLE_DELAY_MS);
  }

  // 投稿ページを離れたことを検知したら即戻さず、投稿完了（トースト表示）を
  // 待ってから投稿ページへ戻す。これにより投稿リクエスト完了前の早すぎる
  // リロードで投稿を中断させない。
  function enforceLock(): void {
    if (isComposePage()) {
      stopWatch();
      return;
    }
    if (watchTimer !== null || returnTimer !== null) return; // 既に監視/復帰予約中
    watchWaited = 0;
    watchTimer = setInterval(() => {
      if (isComposePage()) {
        stopWatch();
        return;
      }
      // 完了トーストを検知＝投稿完了 → 少し待ってから戻す。
      if (hasPostSentToast()) {
        scheduleReturnAfterToast();
        return;
      }
      watchWaited += WATCH_POLL_MS;
      if (postWasSending) {
        // 投稿送信済み → トーストを待つ。上限超過時のみフォールバックで戻す。
        if (watchWaited >= POST_TOAST_MAX_WAIT_MS) returnToCompose();
      } else {
        // 送信を伴わない遷移 → 短い猶予後に戻す（ロック本来の挙動）。
        if (watchWaited >= PLAIN_NAV_GRACE_MS) returnToCompose();
      }
    }, WATCH_POLL_MS);
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

  // 送信状態の追跡と、History API を介さない遷移の保険としてのポーリング。
  let previousHref = window.location.href;
  setInterval(() => {
    syncSendingState();
    const currentHref = window.location.href;
    if (currentHref !== previousHref) {
      previousHref = currentHref;
      enforceLock();
    }
  }, 500);

  syncSendingState();
})();

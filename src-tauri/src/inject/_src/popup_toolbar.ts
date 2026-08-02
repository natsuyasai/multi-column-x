// src-tauri/src/inject/_src/popup_toolbar.ts
// コマンド名定数の一覧は constants.ts を参照
const SWITCH_POPUP_SESSION = "switch_popup_session";
const CLOSE_POPUP_WINDOW = "close_popup_window";
const DOWNLOAD_VIDEO = "download_video";
// イベント名定数の一覧は src/constants/ipc.ts の IPC_EVENTS を参照
const VIDEO_DOWNLOAD_PROGRESS = "video-download-progress";

interface VideoDownloadProgressPayload {
  fileIndex: number;
  fileCount: number;
  current: number;
  total: number | null;
  phase: "downloading" | "completed" | "failed";
}

/**
 * 動画ダウンロード進捗イベントのペイロードから、ツールバーに表示するテキストを組み立てる。
 * - "downloading": total が分かればパーセンテージを表示、不明なら省略する。
 * - "completed" / "failed": その旨のテキストを表示する。
 * - fileCount > 1 の場合（HLSの映像+音声）は "(fileIndex/fileCount)" を併記する。
 */
export function formatVideoDownloadProgressText(
  payload: VideoDownloadProgressPayload,
): string {
  const { fileIndex, fileCount, current, total, phase } = payload;
  const fileLabel = fileCount > 1 ? ` (${fileIndex}/${fileCount})` : "";

  if (phase === "completed") return `ダウンロード完了${fileLabel}`;
  if (phase === "failed") return `ダウンロード失敗${fileLabel}`;

  if (total === null) return `ダウンロード中${fileLabel}`;
  const percent = total === 0 ? 0 : Math.floor((current / total) * 100);
  return `ダウンロード中${fileLabel} ${percent}%`;
}

// 動画情報（variants）の抽出は image_popup.ts の extractQuotedTweetId と同じ
// React Fiber 解析パターンを使う。inject スクリプトはビルドエントリ間で ES module の
// import ができない構造のため（docs/development/inject-ipc-shortcuts-notes.md 参照）、
// このファイル内に独立実装する。

interface PopupVideoVariant {
  contentType: string;
  bitrate?: number;
  url: string;
}

interface PopupReactFiberNode {
  memoizedProps?: Record<string, unknown> | null;
  return?: PopupReactFiberNode | null;
}

function getPopupReactFiber(el: Element): PopupReactFiberNode | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key
    ? ((el as unknown as Record<string, unknown>)[key] as PopupReactFiberNode)
    : null;
}

function isPopupRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const VIDEO_PLAYER_SELECTOR = '[data-testid="videoComponent"]';

/**
 * 指定要素からReact Fiberの return チェーンを遡り、predicate を満たす最初の
 * memoizedProps を返す（最大50段）。
 */
function findAncestorProps(
  el: Element,
  predicate: (props: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  let fiber = getPopupReactFiber(el);
  let depth = 0;
  while (fiber && depth < 50) {
    const props = fiber.memoizedProps;
    if (isPopupRecord(props) && predicate(props)) {
      return props;
    }
    fiber = fiber.return ?? null;
    depth++;
  }
  return null;
}

/** VideoPlayerコンポーネントの variants（`{ type, src, bitrate }` 形式）を変換する。 */
function toPlayerVideoVariants(rawVariants: unknown[]): PopupVideoVariant[] {
  const variants: PopupVideoVariant[] = [];
  for (const raw of rawVariants) {
    if (!isPopupRecord(raw)) continue;
    const { type, src, bitrate } = raw;
    if (typeof type !== "string" || typeof src !== "string") continue;
    const variant: PopupVideoVariant = { contentType: type, url: src };
    if (typeof bitrate === "number") variant.bitrate = bitrate;
    variants.push(variant);
  }
  return variants;
}

/**
 * 動画詳細ページのVideoPlayerコンポーネントから、React Fiber経由でvariants一覧を抽出する。
 * 見つからなければ null（動画を一度も再生していない等でvideoComponentが未マウントの場合を含む）。
 */
function extractVideoVariantsFromPlayer(
  startEl?: Element | null,
): PopupVideoVariant[] | null {
  const el = startEl ?? document.querySelector(VIDEO_PLAYER_SELECTOR);
  if (!el) return null;

  const props = findAncestorProps(el, (p) => Array.isArray(p.variants));
  if (!props) return null;

  const variants = toPlayerVideoVariants(props.variants as unknown[]);
  return variants.length > 0 ? variants : null;
}

/** VideoPlayerコンポーネントのprops（videoId: { id }）からツイートID相当の文字列を取得する。 */
function extractVideoIdFromPlayer(startEl?: Element | null): string | null {
  const el = startEl ?? document.querySelector(VIDEO_PLAYER_SELECTOR);
  if (!el) return null;

  const props = findAncestorProps(
    el,
    (p) => isPopupRecord(p.videoId) && typeof p.videoId.id === "string",
  );
  if (!props) return null;

  return (props.videoId as Record<string, unknown>).id as string;
}

(function () {
  const accounts: TvAccountInfo[] = window.__mcxAccounts ?? [];
  const currentAccountId: string = window.__mcxCurrentAccountId ?? "";
  const targetHref: string = window.__mcxTargetHref ?? "";
  const escCloseEnabled: boolean = window.__mcxEscCloseEnabled ?? true;

  if (document.getElementById("tv-popup-toolbar")) return;

  if (accounts.length === 0) return;

  function tauriInvoke(
    cmd: string,
    args: Record<string, unknown>,
    onSettled?: () => void,
  ): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args)
        .catch(function (err: unknown) {
          console.error("[popup_toolbar]", err);
        })
        .finally(function () {
          onSettled?.();
        });
    } else {
      onSettled?.();
    }
  }

  const TOOLBAR_HEIGHT = 40;

  const toolbar = document.createElement("div");
  toolbar.id = "tv-popup-toolbar";
  toolbar.style.cssText = [
    "position: fixed",
    "bottom: 0",
    "left: 0",
    "width: 100%",
    "height: " + TOOLBAR_HEIGHT + "px",
    "z-index: 99999",
    "background: #15202b",
    "border-top: 1px solid #38444d",
    "display: flex",
    "align-items: center",
    "padding: 0 12px",
    "box-sizing: border-box",
    "font-family: sans-serif",
    "font-size: 13px",
    "color: #e7e9ea",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "アカウント: ";
  label.style.cssText = "margin-right: 8px; white-space: nowrap;";

  const select = document.createElement("select");
  select.style.cssText = [
    "background: #253341",
    "color: #e7e9ea",
    "border: 1px solid #38444d",
    "border-radius: 4px",
    "padding: 4px 8px",
    "font-size: 13px",
    "cursor: pointer",
    "max-width: 200px",
  ].join(";");

  accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.label;
    if (account.id === currentAccountId) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener("change", function () {
    const selectedId = select.value;
    const selectedAccount = accounts.find((a) => a.id === selectedId);
    if (!selectedAccount) return;
    // Android のネイティブ WebView には Tauri IPC が無いため、
    // addJavascriptInterface で公開されたブリッジを優先して使う。
    const androidBridge = window.__mcxPopupBridge;
    if (androidBridge) {
      androidBridge.switchPopupSession(
        selectedAccount.id,
        window.location.href,
      );
      return;
    }
    const popupLabel =
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "";
    tauriInvoke(SWITCH_POPUP_SESSION, {
      popupLabel,
      accountId: selectedAccount.id,
      dataDirectory: selectedAccount.dataDirectory,
      url: window.location.href,
    });
  });

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.id = "tv-popup-download-button";
  downloadButton.textContent = "動画をダウンロード";
  downloadButton.style.cssText = [
    "background: #253341",
    "color: #e7e9ea",
    "border: 1px solid #38444d",
    "border-radius: 4px",
    "padding: 4px 8px",
    "font-size: 13px",
    "cursor: pointer",
    "margin-left: 8px",
    "white-space: nowrap",
  ].join(";");

  const downloadStatus = document.createElement("span");
  downloadStatus.id = "tv-popup-download-status";
  downloadStatus.style.cssText =
    "margin-left: 8px; white-space: nowrap; color: #f4212e;";

  /**
   * ダウンロードボタンの表示/非表示を、動画プレイヤーがDOM上に存在するかどうかで切り替える。
   * ポップアップで開かれるページは動画詳細ページとは限らないため、動画が無いページでは
   * ボタンを隠す。MutationObserver から初期化時・DOM変化のたびに呼ばれる想定。
   */
  function updateDownloadButtonVisibility(): void {
    // observer は明示的に disconnect しないため（下記コメント参照）、テストでは
    // vi.resetModules() のたびに前のテストの observer が残存し、jsdom 環境が
    // 破棄された後にコールバックが発火して document が undefined になりうる。
    // 実ブラウザではポップアップが閉じられるとJS実行コンテキストごと破棄されるため
    // 到達しないが、テストのノイズ防止のためガードする。
    if (typeof document === "undefined") return;
    const hasVideo = extractVideoVariantsFromPlayer() !== null;
    downloadButton.style.display = hasVideo ? "" : "none";
  }

  const DOWNLOAD_FEEDBACK_CLEAR_DELAY_MS = 3000;

  /** downloadStatus を一定時間後に空にする（メッセージ自体は呼び出し側で設定済みの前提）。 */
  function clearDownloadFeedbackAfterDelay(): void {
    setTimeout(() => {
      downloadStatus.textContent = "";
    }, DOWNLOAD_FEEDBACK_CLEAR_DELAY_MS);
  }

  function showDownloadFeedback(message: string): void {
    downloadStatus.textContent = message;
    clearDownloadFeedbackAfterDelay();
  }

  downloadButton.addEventListener("click", function () {
    const variants = extractVideoVariantsFromPlayer();
    if (!variants) {
      showDownloadFeedback("動画を再生してからダウンロードしてください");
      return;
    }
    const suggestedFileName = extractVideoIdFromPlayer() ?? "";
    downloadButton.disabled = true;
    tauriInvoke(DOWNLOAD_VIDEO, { variants, suggestedFileName }, function () {
      downloadButton.disabled = false;
    });
  });

  toolbar.appendChild(label);
  toolbar.appendChild(select);
  toolbar.appendChild(downloadButton);
  toolbar.appendChild(downloadStatus);

  function inject() {
    const doInject = () => {
      document.body.appendChild(toolbar);
      updateDownloadButtonVisibility();

      // ポップアップで開かれるページは動画詳細ページとは限らないため、動画プレイヤーの
      // マウント/アンマウントを継続監視してボタンの表示状態を追従させる。ポップアップウィンドウが
      // 閉じられればJS実行コンテキストごと破棄されるため、明示的な disconnect() は不要。
      const videoObserver = new MutationObserver(() => {
        updateDownloadButtonVisibility();
      });
      videoObserver.observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) {
      doInject();
    } else {
      document.addEventListener("DOMContentLoaded", doInject);
    }
  }

  inject();

  const listen = window.__TAURI__?.event?.listen;
  if (listen) {
    listen<VideoDownloadProgressPayload>(VIDEO_DOWNLOAD_PROGRESS, function (e) {
      downloadStatus.textContent = formatVideoDownloadProgressText(e.payload);
      if (e.payload.phase !== "downloading") {
        clearDownloadFeedbackAfterDelay();
      }
    }).catch(function (err: unknown) {
      console.error("[popup_toolbar]", err);
    });
  }

  if (escCloseEnabled) {
    document.addEventListener("keydown", function (e: KeyboardEvent) {
      if (e.key === "Escape") {
        tauriInvoke(CLOSE_POPUP_WINDOW, {
          label:
            window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "",
        });
      }
    });
  }

  // targetHref と一致する <a> をページロード後に自動クリックする
  if (!targetHref) return;

  function normalizeHref(href: string): string {
    try {
      const u = new URL(href, "https://x.com");
      return u.pathname + u.search;
    } catch {
      return href;
    }
  }

  function tryClick(root: Document): boolean {
    const targetPath = normalizeHref(targetHref);
    const links = root.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const link of links) {
      if (normalizeHref(link.getAttribute("href") ?? "") === targetPath) {
        link.click();
        return true;
      }
    }
    return false;
  }

  function watchAndClick(): void {
    if (tryClick(document)) return;
    const observer = new MutationObserver(() => {
      if (tryClick(document)) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchAndClick);
  } else {
    watchAndClick();
  }
})();

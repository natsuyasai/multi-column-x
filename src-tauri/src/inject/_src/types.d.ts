// src-tauri/src/inject/_src/types.d.ts

declare global {
  interface MultiColumnXAPI {
    applyCustomCSS: (css: string) => void;
    triggerReload: (scrollToTop?: boolean) => void;
    applyAreaVisibility: (
      hideHeaderEnabled: boolean,
      hideTweetInputEnabled: boolean,
    ) => void;
    recheckNgWords: () => void;
    /**
     * 投稿カラム（/home）でインライン投稿フォーム以外を隠すスポットライトの再適用。
     * compose_only.ts が公開し、テストからの検証にも用いる。
     */
    applyComposeOnly?: () => void;
    /**
     * #layers配下の投稿ボタン/ヘッダー要素の個別表示切替の再適用。
     * mobile_area_hide.ts が公開し、設定変更時の即時反映に用いる。
     */
    applyLayersHide?: () => void;
    /**
     * ホームタイムライン「前回の境目へ戻る」ボタンの有効/無効を即時切り替える。
     * return_to_last_read.ts が公開する。
     */
    setReturnToLastReadEnabled?: (enabled: boolean) => void;
  }

  interface MultiColumnXConfig {
    hideHeaderEnabled: boolean;
    hideTweetInputEnabled: boolean;
    showCustomMenu: boolean;
    visibleLinks: string[];
    smallImageEnabled: boolean;
    smallImageWidth: string;
    blurImageEnabled: boolean;
    blurImageAmount: string;
    hideAdEnabled: boolean;
    apiRateLimitMonitorEnabled?: boolean;
    imagePopupEnabled?: boolean;
    videoPopupEnabled?: boolean;
    ngWords?: string[];
    globalNgWords?: string[];
    repostHiddenUserIds?: string[];
    globalRepostHiddenUserIds?: string[];
    whitelistEnabled?: boolean;
    whitelistWords?: string[];
    returnToLastReadEnabled?: boolean;
  }

  interface TauriCore {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  }

  interface TauriEventPayload<T> {
    event: string;
    payload: T;
  }

  interface TauriEvent {
    listen: <T>(
      event: string,
      handler: (payload: TauriEventPayload<T>) => void,
    ) => Promise<() => void>;
  }

  interface TauriGlobal {
    core?: TauriCore;
    event?: TauriEvent;
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  }

  interface TauriInternalsMetadata {
    currentWindow?: { label: string };
    currentWebview?: { label: string };
  }

  interface TauriInternals {
    metadata?: TauriInternalsMetadata;
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  }

  // Android で MainActivity が addWebMessageListener で公開するネイティブブリッジ共通の形。
  // JS からは postMessage(JSON.stringify({ type, ... })) の形でメッセージを送る
  // （オリジンを X 系ドメインに限定するため addJavascriptInterface ではなく
  // addWebMessageListener を使っている。詳細は BridgeMessages.kt 参照）。
  interface McxPopupBridge {
    postMessage: (message: string) => void;
  }

  interface McxVideoDownloadBridge {
    postMessage: (message: string) => void;
  }

  interface McxApiRateLimitBridge {
    postMessage: (message: string) => void;
  }

  interface TvAccountInfo {
    id: string;
    label: string;
    color: string;
  }

  // document.body の childList+subtree 監視を共有する単一 MutationObserver ハブ。
  // dom_observer.ts が公開する。詳細は同ファイルのコメント参照。
  interface McxDomObserver {
    subscribe: (callback: (mutations: MutationRecord[]) => void) => () => void;
  }

  interface Window {
    __multiColumnX: MultiColumnXAPI;
    __multiColumnXConfig?: MultiColumnXConfig;
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: TauriInternals;
    __mcxAccounts?: TvAccountInfo[];
    __mcxCurrentAccountId?: string;
    __mcxTargetHref?: string;
    __mcxEscCloseEnabled?: boolean;
    __mcxPopupBridge?: McxPopupBridge;
    __mcxVideoDownloadBridge?: McxVideoDownloadBridge;
    __mcxApiRateLimitBridge?: McxApiRateLimitBridge;
    __mobileTopInset?: number;
    __mobileBottomInset?: number;
    __xhrRateLimitPatched?: boolean;
    __mcxDomObserver?: McxDomObserver;
  }
}

export {};

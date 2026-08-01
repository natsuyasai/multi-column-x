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
    imagePopupEnabled?: boolean;
    videoPopupEnabled?: boolean;
    ngWords?: string[];
    globalNgWords?: string[];
  }

  interface TauriCore {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  }

  interface TauriGlobal {
    core?: TauriCore;
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

  // Android で MainActivity が addJavascriptInterface で公開するポップアップ操作ブリッジ
  interface McxPopupBridge {
    switchPopupSession: (accountId: string, url: string) => void;
  }

  // Android で MainActivity が addJavascriptInterface で公開する動画DL要求ブリッジ
  interface McxVideoDownloadBridge {
    downloadVideo: (payloadJson: string) => void;
  }

  interface TvAccountInfo {
    id: string;
    label: string;
    color: string;
    dataDirectory: string;
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
    __mobileTopInset?: number;
    __mobileBottomInset?: number;
  }
}

export {};

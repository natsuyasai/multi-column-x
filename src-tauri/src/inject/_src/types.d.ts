// src-tauri/src/inject/_src/types.d.ts

declare global {
  interface MultiColumnXAPI {
    selectHomeTab: () => void;
    applyCustomCSS: (css: string) => void;
    triggerReload: (scrollToTop?: boolean) => void;
    applyAreaRemove: (enabled: boolean) => void;
    recheckNgWords: () => void;
  }

  interface MultiColumnXConfig {
    areaRemoveEnabled: boolean;
    showCustomMenu: boolean;
    visibleLinks: string[];
    smallImageEnabled: boolean;
    smallImageWidth: string;
    blurImageEnabled: boolean;
    blurImageAmount: string;
    hideAdEnabled: boolean;
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
    __mobileTopInset?: number;
    __mobileBottomInset?: number;
  }
}

export {};

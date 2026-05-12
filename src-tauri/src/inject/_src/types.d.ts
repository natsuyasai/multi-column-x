// src-tauri/src/inject/_src/types.d.ts

declare global {
  interface MultiColumnXAPI {
    selectHomeTab: () => void;
    applyCustomCSS: (css: string) => void;
    triggerReload: () => void;
    applyAreaRemove: (enabled: boolean) => void;
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
    zoomLevel: number;
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
    __tvAccounts?: TvAccountInfo[];
    __tvCurrentAccountId?: string;
    __tvTargetHref?: string;
    __tvEscCloseEnabled?: boolean;
    __mobileTopInset?: number;
    __mobileBottomInset?: number;
  }
}

export {};

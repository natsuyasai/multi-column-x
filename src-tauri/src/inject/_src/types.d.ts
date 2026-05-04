// src-tauri/src/inject/_src/types.d.ts

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
}

interface TvAccountInfo {
  id: string;
  label: string;
  color: string;
  dataDirectory: string;
}

declare global {
  interface Window {
    __multiColumnX: MultiColumnXAPI;
    __multiColumnXConfig?: MultiColumnXConfig;
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: TauriInternals;
    __tvAccounts?: TvAccountInfo[];
    __tvCurrentAccountId?: string;
    __tvTargetHref?: string;
    __tvEscCloseEnabled?: boolean;
  }
}

export {};

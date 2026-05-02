// src-tauri/src/inject/_src/types.d.ts

interface TwitterViewerAPI {
  selectHomeTab: () => void;
  applyCustomCSS: (css: string) => void;
  triggerReload: () => void;
  applyAreaRemove: (enabled: boolean) => void;
}

interface TwitterViewerConfig {
  areaRemoveEnabled: boolean;
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
}

interface TauriInternals {
  metadata?: TauriInternalsMetadata;
}

declare global {
  interface Window {
    __twitterViewer: TwitterViewerAPI;
    __twitterViewerConfig?: TwitterViewerConfig;
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export {};

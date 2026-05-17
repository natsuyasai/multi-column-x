// src/types/global.d.ts
//
// window グローバルオブジェクトの型定義。
// inject スクリプトが window に追加するオブジェクトを TypeScript から参照できるようにする。
// inject スクリプト側の型定義は src-tauri/src/inject/_src/types.d.ts を参照。

/** カラム WebView に inject される API オブジェクト (window.__multiColumnX) */
interface MultiColumnXAPI {
  /** ページをリロードする */
  triggerReload: () => void;
  /** カスタム CSS を適用する */
  applyCustomCSS: (css: string) => void;
  /** ヘッダーカスタマイズ（エリア除去）の有効/無効を切り替える */
  applyAreaRemove: (enabled: boolean) => void;
  /** ホームタブを選択する */
  selectHomeTab: () => void;
}

/** カラム WebView に inject される設定オブジェクト (window.__multiColumnXConfig) */
interface MultiColumnXConfig {
  /** ヘッダーカスタマイズ（エリア除去）が有効かどうか */
  areaRemoveEnabled: boolean;
  /** カスタムコンテキストメニューを表示するかどうか */
  showCustomMenu: boolean;
  /** 表示するナビゲーションリンク（空配列 = すべて表示） */
  visibleLinks: string[];
}

/** ポップアップ WebView に inject されるアカウント情報 */
interface TvAccountInfo {
  id: string;
  label: string;
  color: string;
  dataDirectory: string;
}

declare global {
  interface Window {
    /** カラム WebView 内の API オブジェクト */
    __multiColumnX: MultiColumnXAPI;
    /** カラム WebView 内の設定オブジェクト */
    __multiColumnXConfig?: MultiColumnXConfig;
    /** ポップアップ WebView 内のアカウント一覧 */
    __tvAccounts?: TvAccountInfo[];
    /** ポップアップ WebView 内の現在のアカウント ID */
    __tvCurrentAccountId?: string;
    /** ポップアップ WebView 内の自動クリック対象 href */
    __tvTargetHref?: string;
    /** ポップアップ WebView 内の Esc キーで閉じる設定 */
    __tvEscCloseEnabled?: boolean;
    /** モバイル: ステータスバー高さ (dp) */
    __mobileTopInset?: number;
    /** モバイル: ナビゲーションバー高さ (dp) */
    __mobileBottomInset?: number;
  }
}

declare module "*.svg?react" {
  import React from "react";
  const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

export {};

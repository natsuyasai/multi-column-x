// src/types/global.d.ts
//
// window グローバルオブジェクトの型定義。
// inject スクリプトが window に追加するオブジェクトを TypeScript から参照できるようにする。
// inject スクリプト側の型定義は src-tauri/src/inject/_src/types.d.ts を参照。

/** カラム WebView に inject される API オブジェクト (window.__multiColumnX) */
interface MultiColumnXAPI {
  /** ページをリロードする。scrollToTop=true の場合はスクロール位置を先頭に戻してからリロードする */
  triggerReload: (scrollToTop?: boolean) => void;
  /** カスタム CSS を適用する */
  applyCustomCSS: (css: string) => void;
  /** ヘッダー非表示・投稿欄非表示の有効/無効をそれぞれ切り替える */
  applyAreaVisibility: (
    hideHeaderEnabled: boolean,
    hideTweetInputEnabled: boolean,
  ) => void;
  /** ホームタイムライン「前回の境目へ戻る」ボタンの有効/無効を即時切り替える */
  setReturnToLastReadEnabled?: (enabled: boolean) => void;
}

/** カラム WebView に inject される設定オブジェクト (window.__multiColumnXConfig) */
interface MultiColumnXConfig {
  /** ヘッダーを非表示にするかどうか */
  hideHeaderEnabled: boolean;
  /** 投稿欄を非表示にするかどうか */
  hideTweetInputEnabled: boolean;
  /** カスタムコンテキストメニューを表示するかどうか */
  showCustomMenu: boolean;
  /** 表示するナビゲーションリンク（空配列 = すべて表示） */
  visibleLinks: string[];
  /** ホームタイムライン「前回の境目へ戻る」ボタンを有効にするかどうか */
  returnToLastReadEnabled?: boolean;
}

/** ポップアップ WebView に inject されるアカウント情報（ローカル保存先は含めない） */
interface TvAccountInfo {
  id: string;
  label: string;
  color: string;
}

declare global {
  interface Window {
    /** カラム WebView 内の API オブジェクト */
    __multiColumnX: MultiColumnXAPI;
    /** カラム WebView 内の設定オブジェクト */
    __multiColumnXConfig?: MultiColumnXConfig;
    /** ポップアップ WebView 内のアカウント一覧 */
    __mcxAccounts?: TvAccountInfo[];
    /** ポップアップ WebView 内の現在のアカウント ID */
    __mcxCurrentAccountId?: string;
    /** ポップアップ WebView 内の自動クリック対象 href */
    __mcxTargetHref?: string;
    /** ポップアップ WebView 内の Esc キーで閉じる設定 */
    __mcxEscCloseEnabled?: boolean;
    /** モバイル: ステータスバー高さ (dp) */
    __mobileTopInset?: number;
    /** モバイル: ナビゲーションバー高さ (dp) */
    __mobileBottomInset?: number;
  }
}

export {};

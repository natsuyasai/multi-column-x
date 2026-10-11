// src-tauri/src/inject/_src/i18n.ts
//
// inject スクリプトの自前 UI 文言を日本語・英語で切り替えるための共有ハブ。
// 各 inject エントリは独立した IIFE のため、ES import で共有すると Rollup の共有チャンクが
// 生成され include_str! 連結が壊れる。そのためこのファイルは window.__mcxI18n を公開し、
// 他のスクリプトは window.__mcxI18n.t("key") 経由で文言を参照する。
//
// - 初期言語は Rust が先に定義する window.__mcxLang（"ja" | "en"）。未定義なら "ja"。
// - 未対応言語は "en" として扱う。
// - 未知キーは ja 辞書、それも無ければキー文字列をそのまま返す。
// - 補間は {name} 形式（TS 側 i18next とは独立）。
// - このハブは build_init_script / build_popup_init_script で dom_observer の直後、
//   他のどのスクリプトよりも前に連結される。
(function () {
  // 多重注入に備えて冪等にする。既にハブが存在する場合は何もしない。
  if (window.__mcxI18n) return;

  type Dict = Record<string, string>;

  const ja: Dict = {
    "contextMenu.openInPopup": "ポップアップウィンドウで開く",

    "header.toggleNav.hide": "ナビゲーションを非表示",
    "header.toggleNav.show": "ナビゲーションを表示",
    "header.link.home": "ホーム",
    "header.link.search": "調べたいものを検索",
    "header.link.notifications": "通知",
    "header.link.messages": "ダイレクトメッセージ",
    "header.link.lists": "リスト",
    "header.link.bookmarks": "ブックマーク",
    "header.link.communities": "コミュニティ",
    "header.link.premium": "プレミアム",
    "header.link.profile": "プロフィール",
    "header.link.compose": "ポストする",
    "header.compose": "ポストする",
    "header.close": "閉じる",

    "popupToolbar.download.completed": "ダウンロード完了{file}",
    "popupToolbar.download.failed": "ダウンロード失敗{file}",
    "popupToolbar.download.downloading": "ダウンロード中{file}",
    "popupToolbar.download.downloadingPercent":
      "ダウンロード中{file} {percent}%",
    "popupToolbar.account": "アカウント: ",
    "popupToolbar.downloadVideo": "動画をダウンロード",
    "popupToolbar.playBeforeDownload":
      "動画を再生してからダウンロードしてください",
    "popupToolbar.applyToColumns": "各カラムに適用",
    "popupToolbar.settingsNotFound": "設定が見つかりませんでした",
    "popupToolbar.applied": "各カラムに適用しました",
    "popupToolbar.exit": "終了",

    "lastRead.notFound": "前回の位置が見つかりませんでした",
    "lastRead.aria": "前回の続きへ戻る",
    "lastRead.ariaClose": "前回の続きへ戻るボタンを閉じる",
    "lastRead.searching": "探しています…",
    "lastRead.label": "↓ 前回の続きへ",

    "videoMenu.download": "動画をダウンロード",
    "videoMenu.popup": "動画をポップアップで表示",
  };

  const en: Dict = {
    "contextMenu.openInPopup": "Open in popup window",

    "header.toggleNav.hide": "Hide navigation",
    "header.toggleNav.show": "Show navigation",
    "header.link.home": "Home",
    "header.link.search": "Search",
    "header.link.notifications": "Notifications",
    "header.link.messages": "Messages",
    "header.link.lists": "Lists",
    "header.link.bookmarks": "Bookmarks",
    "header.link.communities": "Communities",
    "header.link.premium": "Premium",
    "header.link.profile": "Profile",
    "header.link.compose": "Post",
    "header.compose": "Post",
    "header.close": "Close",

    "popupToolbar.download.completed": "Download complete{file}",
    "popupToolbar.download.failed": "Download failed{file}",
    "popupToolbar.download.downloading": "Downloading{file}",
    "popupToolbar.download.downloadingPercent": "Downloading{file} {percent}%",
    "popupToolbar.account": "Account: ",
    "popupToolbar.downloadVideo": "Download video",
    "popupToolbar.playBeforeDownload": "Play the video before downloading",
    "popupToolbar.applyToColumns": "Apply to columns",
    "popupToolbar.settingsNotFound": "Settings not found",
    "popupToolbar.applied": "Applied to columns",
    "popupToolbar.exit": "Exit",

    "lastRead.notFound": "Couldn't find your last position",
    "lastRead.aria": "Back to where you left off",
    "lastRead.ariaClose": "Close the back-to-where-you-left-off button",
    "lastRead.searching": "Searching…",
    "lastRead.label": "↓ Where you left off",

    "videoMenu.download": "Download video",
    "videoMenu.popup": "Show video in popup",
  };

  const dictionaries: Record<string, Dict> = { ja, en };

  const TEXT_ATTR = "data-mcx-i18n";
  const ATTR_ATTR = "data-mcx-i18n-attr";

  function normalize(lang: unknown): string {
    if (lang === "ja") return "ja";
    return "en";
  }

  let currentLang =
    window.__mcxLang === undefined ? "ja" : normalize(window.__mcxLang);
  const listeners: Array<(lang: string) => void> = [];

  function t(key: string, params?: Record<string, string | number>): string {
    const template = dictionaries[currentLang][key] ?? ja[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match,
    );
  }

  function apply(el: Element, key: string, opts?: { attr?: string }): void {
    if (opts?.attr) {
      el.setAttribute(opts.attr, t(key));
      el.setAttribute(ATTR_ATTR, `${opts.attr}:${key}`);
    } else {
      el.textContent = t(key);
      el.setAttribute(TEXT_ATTR, key);
    }
  }

  function reapplyAll(): void {
    document.querySelectorAll(`[${TEXT_ATTR}]`).forEach((el) => {
      const key = el.getAttribute(TEXT_ATTR);
      if (key === null) return;
      const text = t(key);
      // 同じ値の再代入でも DOM ミューテーションが発生するため、変化時のみ代入する
      if (el.textContent !== text) el.textContent = text;
    });
    document.querySelectorAll(`[${ATTR_ATTR}]`).forEach((el) => {
      const spec = el.getAttribute(ATTR_ATTR);
      if (spec === null) return;
      const sep = spec.indexOf(":");
      if (sep <= 0) return;
      const attr = spec.slice(0, sep);
      const value = t(spec.slice(sep + 1));
      if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
    });
  }

  function setLang(lang: string): void {
    currentLang = normalize(lang);
    api.lang = currentLang;
    reapplyAll();
    listeners.slice().forEach((cb) => {
      try {
        cb(currentLang);
      } catch (e) {
        console.error("[mcx i18n] onChange callback failed", e);
      }
    });
  }

  function onChange(cb: (lang: string) => void): () => void {
    listeners.push(cb);
    return function unsubscribe(): void {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  const api: McxI18n = { lang: currentLang, t, setLang, apply, onChange };
  window.__mcxI18n = api;
})();

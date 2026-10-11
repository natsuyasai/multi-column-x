import { defineConfig } from "vitepress";

// 日本語の単語境界で分割するトークナイザ（MiniSearch の既定は日本語に弱い）。
// 検索インデックスはビルド時に全ロケール共通の設定で作られるため、トークナイザはロケール別に出し分けられない。
// そこで日本語・中国語・韓国語の文字を含むテキストだけ Intl.Segmenter で分割し、
// それ以外（英語など）は MiniSearch 既定と同じ「空白・句読点で分割」にする。
const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
const CJK =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]/u;
const SPACE_OR_PUNCTUATION = /[\s\p{Z}\p{P}]+/u;
const tokenize = (text: string): string[] =>
  CJK.test(text)
    ? Array.from(segmenter.segment(text))
        .filter((s) => s.isWordLike)
        .map((s) => s.segment)
    : text.split(SPACE_OR_PUNCTUATION).filter(Boolean);

const editLinkPattern =
  "https://github.com/natsuyasai/multi-column-x/edit/main/docs/guide/:path";

export default defineConfig({
  base: "/multi-column-x/",
  cleanUrls: true,
  // 公開対象は docs/guide/ 配下のみ（開発者向け資料は srcDir の外にあるため公開されない）
  srcDir: "guide",
  themeConfig: {
    search: {
      provider: "local",
      options: {
        miniSearch: {
          options: { tokenize },
          searchOptions: { tokenize },
        },
        locales: {
          root: {
            translations: {
              button: { buttonText: "検索", buttonAriaLabel: "検索" },
              modal: {
                displayDetails: "詳細を表示",
                resetButtonTitle: "リセット",
                backButtonTitle: "閉じる",
                noResultsText: "結果が見つかりません",
                footer: {
                  selectText: "選択",
                  selectKeyAriaLabel: "Enter",
                  navigateText: "移動",
                  navigateUpKeyAriaLabel: "上矢印",
                  navigateDownKeyAriaLabel: "下矢印",
                  closeText: "閉じる",
                  closeKeyAriaLabel: "Esc",
                },
              },
            },
          },
          en: {
            translations: {
              button: { buttonText: "Search", buttonAriaLabel: "Search" },
              modal: {
                displayDetails: "Display detailed list",
                resetButtonTitle: "Reset search",
                backButtonTitle: "Close search",
                noResultsText: "No results for",
                footer: {
                  selectText: "to select",
                  selectKeyAriaLabel: "enter",
                  navigateText: "to navigate",
                  navigateUpKeyAriaLabel: "up arrow",
                  navigateDownKeyAriaLabel: "down arrow",
                  closeText: "to close",
                  closeKeyAriaLabel: "escape",
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/natsuyasai/multi-column-x" },
    ],
  },
  locales: {
    root: {
      label: "日本語",
      lang: "ja-JP",
      title: "Multi Column X 利用ガイド",
      themeConfig: {
        sidebar: [
          {
            text: "ガイド",
            items: [
              { text: "はじめに", link: "/" },
              { text: "インストール", link: "/install" },
              { text: "初回起動と画面構成", link: "/screen" },
              { text: "アカウント", link: "/accounts" },
              { text: "カラム", link: "/columns" },
              { text: "設定", link: "/settings" },
              {
                text: "ポップアップとショートカット",
                link: "/popup-shortcuts",
              },
              { text: "対応環境と機能一覧", link: "/environments" },
              { text: "Android", link: "/android" },
              { text: "アプリの更新", link: "/update" },
              { text: "よくある質問", link: "/faq" },
            ],
          },
        ],
        editLink: { pattern: editLinkPattern, text: "このページを編集" },
        outline: { level: [2, 3], label: "目次" },
        docFooter: { prev: "前のページ", next: "次のページ" },
        returnToTopLabel: "ページ上部へ",
        sidebarMenuLabel: "メニュー",
        darkModeSwitchLabel: "外観",
        lightModeSwitchTitle: "ライトテーマに切り替え",
        darkModeSwitchTitle: "ダークテーマに切り替え",
        langMenuLabel: "言語を変更",
      },
    },
    en: {
      label: "English",
      lang: "en-US",
      link: "/en/",
      title: "Multi Column X User Guide",
      themeConfig: {
        sidebar: [
          {
            text: "Guide",
            items: [
              { text: "Getting started", link: "/en/" },
              { text: "Installation", link: "/en/install" },
              { text: "First launch and screen layout", link: "/en/screen" },
              { text: "Accounts", link: "/en/accounts" },
              { text: "Columns", link: "/en/columns" },
              { text: "Settings", link: "/en/settings" },
              { text: "Popups and shortcuts", link: "/en/popup-shortcuts" },
              {
                text: "Supported environments and features",
                link: "/en/environments",
              },
              { text: "Android", link: "/en/android" },
              { text: "Updating the app", link: "/en/update" },
              { text: "FAQ", link: "/en/faq" },
            ],
          },
        ],
        editLink: { pattern: editLinkPattern, text: "Edit this page" },
        outline: { level: [2, 3], label: "On this page" },
        docFooter: { prev: "Previous page", next: "Next page" },
        returnToTopLabel: "Return to top",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Appearance",
        lightModeSwitchTitle: "Switch to light theme",
        darkModeSwitchTitle: "Switch to dark theme",
        langMenuLabel: "Change language",
      },
    },
  },
});

import { defineConfig } from "vitepress";

// 日本語の単語境界で分割するトークナイザ（MiniSearch の既定は日本語に弱い）
const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
const tokenize = (text: string): string[] =>
  Array.from(segmenter.segment(text))
    .filter((s) => s.isWordLike)
    .map((s) => s.segment);

export default defineConfig({
  title: "Multi Column X 利用ガイド",
  lang: "ja-JP",
  base: "/multi-column-x/",
  cleanUrls: true,
  // 開発者向け資料は公開しない（公開対象は USER_GUIDE.md と images/ のみ）
  srcExclude: ["development/**", "specs/**", "superpowers/**"],
  rewrites: { "USER_GUIDE.md": "index.md" },
  // TODO(PR2で解消予定): USER_GUIDE.md 内の ../README.md リンクを GitHub URL に差し替えたら削除する
  ignoreDeadLinks: [/^\.\/\.\.\/README(\.md)?$/],
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
        },
      },
    },
    outline: { level: [2, 3], label: "目次" },
    docFooter: { prev: "前のページ", next: "次のページ" },
    returnToTopLabel: "ページ上部へ",
    sidebarMenuLabel: "メニュー",
    darkModeSwitchLabel: "外観",
    lightModeSwitchTitle: "ライトテーマに切り替え",
    darkModeSwitchTitle: "ダークテーマに切り替え",
    lastUpdated: { text: "最終更新" },
    socialLinks: [
      { icon: "github", link: "https://github.com/natsuyasai/multi-column-x" },
    ],
  },
});

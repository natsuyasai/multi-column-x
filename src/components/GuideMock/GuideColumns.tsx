// ユーザーガイド用スクリーンショットの撮影専用コンポーネント（Storybook 専用。アプリ本体からは import しない）。
// 架空のアカウント・架空の投稿のみを表示し、実在のアカウント・投稿・画像は使わない。
import { ColumnHeader } from "@/components/ColumnHeader/ColumnHeader";
import type { Account, Column } from "@/types";
import styles from "./GuideColumns.module.scss";

const noop = () => {};

const settings: Column["settings"] = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: false,
  hideHeaderEnabled: true,
  hideTweetInputEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  repostHiddenUserIds: [],
  whitelistEnabled: false,
  whitelistWords: [],
  returnToLastReadEnabled: false,
};

const account: Account = {
  id: "guide-acc",
  label: "サンプルユーザー",
  dataDirectory: "/data/guide",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

const baseColumn = {
  accountId: account.id,
  width: 350,
  gridRow: 1,
  heightMode: "auto" as const,
  settings,
};

const columns: Column[] = [
  { ...baseColumn, id: "g-home", pageType: "home", order: 0, gridCol: 1 },
  {
    ...baseColumn,
    id: "g-notifications",
    pageType: "notifications",
    order: 1,
    gridCol: 2,
  },
  {
    ...baseColumn,
    id: "g-search",
    pageType: "search",
    searchQuery: "サンプル",
    order: 2,
    gridCol: 3,
  },
];

interface MockPost {
  name: string;
  handle: string;
  text: string;
  color: string;
}

const postsByColumn: Record<string, MockPost[]> = {
  "g-home": [
    {
      name: "サンプルユーザー",
      handle: "@sample_user",
      text: "これはガイド用の架空の投稿です。複数のカラムを並べてタイムラインを一度に確認できます。",
      color: "#1d9bf0",
    },
    {
      name: "テスト太郎",
      handle: "@test_taro",
      text: "今日はいい天気ですね（架空の投稿）。",
      color: "#17bf63",
    },
    {
      name: "デモ花子",
      handle: "@demo_hanako",
      text: "カラムごとに自動更新や表示設定を変えられます（架空の投稿）。",
      color: "#f45d22",
    },
  ],
  "g-notifications": [
    {
      name: "テスト太郎",
      handle: "@test_taro",
      text: "あなたの投稿に返信しました（架空の通知）。",
      color: "#17bf63",
    },
    {
      name: "デモ花子",
      handle: "@demo_hanako",
      text: "あなたの投稿をいいねしました（架空の通知）。",
      color: "#f45d22",
    },
  ],
  "g-search": [
    {
      name: "ガイド次郎",
      handle: "@guide_jiro",
      text: "「サンプル」を含む架空の検索結果です。",
      color: "#794bc4",
    },
    {
      name: "デモ花子",
      handle: "@demo_hanako",
      text: "検索カラムは条件を保存して常時表示できます（架空の投稿）。",
      color: "#f45d22",
    },
  ],
};

export function GuideColumns() {
  return (
    <div className={styles.board}>
      {columns.map((column) => (
        <section
          key={column.id}
          className={styles.column}
          aria-label={column.id}
        >
          <ColumnHeader
            column={column}
            account={account}
            onReload={noop}
            onReloadPage={noop}
            onScrollTop={noop}
            onSettings={noop}
            onClose={noop}
          />
          <div className={styles.timeline}>
            {postsByColumn[column.id].map((post) => (
              <article key={post.handle + post.text} className={styles.post}>
                <div
                  className={styles.avatar}
                  style={{ backgroundColor: post.color }}
                />
                <div className={styles.body}>
                  <div className={styles.name}>
                    {post.name}
                    <span className={styles.handle}>{post.handle}</span>
                  </div>
                  <p className={styles.text}>{post.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

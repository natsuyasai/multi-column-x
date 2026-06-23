---
description: "Storybook駆動でUI開発を行う（Story-Firstワークフロー）"
user-invocable: true
arg: "開発対象のコンポーネント名や機能の説明"
---

# Storybook駆動UI開発

UI/フロントエンド/React開発を、Story を先に書く Story-First ワークフローで進める。

## ワークフロー

> Story・テストは対象コンポーネントと**同じディレクトリ**に隣り合わせて配置する（コロケーション）。

### 2a. 既存コンポーネントの修正

1. 対象コンポーネントの既存 Story を確認する (`src/components/<Name>/<Name>.stories.tsx`)
2. 必要に応じて新しい Story バリエーションを追加
3. Story の play function でインタラクションテストを記述
4. コンポーネントを修正
5. `npm run test:story` で確認

### 2b. 新規コンポーネントの作成

1. `component-create` スキルでテンプレートを生成
2. Story（`src/components/<Name>/<Name>.stories.tsx`）を先に書く
3. play function でユーザーインタラクションを定義
4. コンポーネントを実装して Story が動くようにする
5. テーマバリエーション（ライト/ダーク）の Story を追加

## テーマバリエーション

アプリは `document.documentElement` の `data-theme` 属性でテーマを切り替える（`useTheme`）。
Story でも documentElement に `data-theme` を設定するデコレーターで再現する。実装例は
`src/components/MobileTabBar/MobileTabBar.stories.tsx` の `ThemeRoot`。

```tsx
function ThemeRoot({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: ReactNode;
}) {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    el.setAttribute("data-theme", theme);
    return () => {
      if (prev === null) el.removeAttribute("data-theme");
      else el.setAttribute("data-theme", prev);
    };
  }, [theme]);
  return <>{children}</>;
}

export const DarkTheme: Story = {
  name: "ダークテーマ",
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
};
```

## play function

インタラクションのある Story には `play` を付ける。コールバックは `storybook/test` の `fn()` で渡し、呼び出しを検証する。

```tsx
play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText("テキスト")).toBeInTheDocument();
  await userEvent.click(canvas.getByRole("button"));
  await expect(args.onClick).toHaveBeenCalledTimes(1);
},
```

## テスト実行

```bash
# Story のインタラクションテスト（chromium ブラウザ実行）
npm run test:story

# 単体テスト
npm test

# Storybook を開いて目視確認
npm run storybook
```

## Story の import 規約（`import-x/order`）

```tsx
// 外部パッケージ（型 → 値、アルファベット順）
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
// @/（internal）
import { Component } from "@/components/Component/Component";
import type { SomeType } from "@/types";
```

- グループ間の空行は入れない
- 同グループ内はアルファベット昇順
- `npm run lint:fix` で自動整列できる

## 参考

- `src/components/MobileTabBar/MobileTabBar.stories.tsx` — play function・テーマバリエーションの参考実装
- `.storybook/main.ts` / `.storybook/preview.tsx` — Storybook 設定（stories の glob、a11y addon）

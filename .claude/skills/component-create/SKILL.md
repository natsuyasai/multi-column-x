---
description: "プロジェクト規約に準拠したReactコンポーネント一式を作成する"
user-invocable: true
arg: "コンポーネント名（PascalCase）"
---

# Reactコンポーネント作成

プロジェクトの規約に沿って、Reactコンポーネント一式を作成します。

## 作成するファイル

`$ARGUMENTS` というコンポーネント名で以下を作成（コロケーション＝同じディレクトリに隣り合わせて配置）:

1. `src/components/$ARGUMENTS/$ARGUMENTS.tsx` — コンポーネント本体
2. `src/components/$ARGUMENTS/$ARGUMENTS.module.scss` — CSS Modules
3. `src/components/$ARGUMENTS/$ARGUMENTS.test.tsx` — 単体テスト（vitest）
4. `src/components/$ARGUMENTS/$ARGUMENTS.stories.tsx` — Storybook Story

> このプロジェクトはバレル（`index.ts`）を作らない。import は各ファイルを直接指す。

## テンプレート

### 1. コンポーネント本体 (`$ARGUMENTS.tsx`)

既存コンポーネント（例: `ColumnHeader` / `MobileTabBar`）に倣い、`React.FC` の名前付きエクスポートにする。

```tsx
import React from "react";
import styles from "./$ARGUMENTS.module.scss";

interface $ARGUMENTSProps {
  // propsをここに定義
}

export const $ARGUMENTS: React.FC<$ARGUMENTSProps> = (props) => {
  return <div className={styles.container}>{/* コンポーネントの内容 */}</div>;
};
```

### 2. CSS Modules (`$ARGUMENTS.module.scss`)

```scss
.container {
  // スタイル定義
}
```

### 3. 単体テスト (`$ARGUMENTS.test.tsx`)

import は `@/` エイリアスで対象を指す。テストケース名は日本語。

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { $ARGUMENTS } from "@/components/$ARGUMENTS/$ARGUMENTS";

describe("$ARGUMENTS", () => {
  it("正しくレンダリングされる", () => {
    render(<$ARGUMENTS />);
    // 検証
  });
});
```

### 4. Storybook Story (`$ARGUMENTS.stories.tsx`)

実装例は `src/components/MobileTabBar/MobileTabBar.stories.tsx` を参照（テーマ切替・play function の書き方）。

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { $ARGUMENTS } from "@/components/$ARGUMENTS/$ARGUMENTS";

const meta: Meta<typeof $ARGUMENTS> = {
  title: "Components/$ARGUMENTS",
  component: $ARGUMENTS,
  parameters: { layout: "centered" },
  args: {
    // デフォルトの props（コールバックは fn() を使う）
  },
};

export default meta;
type Story = StoryObj<typeof $ARGUMENTS>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // インタラクションテストを記述
    void canvas;
  },
};
```

テーマバリエーション（ライト/ダーク）は、アプリが `document.documentElement` の `data-theme` で切り替えるため、`MobileTabBar.stories.tsx` の `ThemeRoot` デコレーターパターンに倣う。

## 注意事項

### import順序（ESLint `import-x/order`）

- 外部パッケージ → vitest/storybook → `@/`（internal）→ 相対パスの順、同グループ内はアルファベット昇順
- グループ間の空行は入れない（`newlines-between: "never"`）
- `npm run lint:fix` で自動整列できる

### アクセシビリティ (jsx-a11y)

新規コンポーネントでは a11y 警告を残さない。以下を確認:

- [ ] インタラクティブ要素には適切な role / `tabIndex` / キーボードハンドラ（`onKeyDown`）がある
- [ ] ボタンやリンクにはアクセシブルな名前（`aria-label` 等）がある
- [ ] フォーム要素には label が関連付けられている
- [ ] 画像・アイコンには代替テキストがある

> 既存コードには段階解消中の a11y 警告が残っているが、新規コードでは解消すること。

### 既存パターンの参考

- 本体の書き方: `src/components/ColumnHeader/ColumnHeader.tsx` / `src/components/MobileTabBar/MobileTabBar.tsx`
- Story（テーマ・play function）: `src/components/MobileTabBar/MobileTabBar.stories.tsx`

## 完了後

`check-creation` スキルで format / typecheck / lint / test / test:story を通す。

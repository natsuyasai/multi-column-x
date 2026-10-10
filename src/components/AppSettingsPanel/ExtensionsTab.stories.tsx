import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  ADDED_BADGE_TEXT,
  CHROME_NOT_FOUND_NOTICE,
  ExtensionsTab,
  MISSING_BADGE_TEXT,
  TRUST_NOTICE,
} from "@/components/AppSettingsPanel/ExtensionsTab";
import type { DetectResult, ExtensionEntry } from "@/types";

const folderExtension: ExtensionEntry = {
  id: "e1",
  name: "フォルダから追加した拡張",
  source: { kind: "folder", path: "C:\\extensions\\sample" },
  enabled: true,
  hasPopup: true,
  hasOptions: true,
  missing: false,
};

const chromeExtension: ExtensionEntry = {
  id: "e2",
  name: "Chrome由来の拡張",
  source: { kind: "chrome", chromeId: "abcdefghijklmnop", profile: "Default" },
  enabled: false,
  hasPopup: false,
  hasOptions: true,
  missing: false,
};

const missingExtension: ExtensionEntry = {
  id: "e3",
  name: "Chromeから消えた拡張",
  source: { kind: "chrome", chromeId: "zzzzzzzzzzzzzzzz", profile: "Default" },
  enabled: false,
  hasPopup: true,
  hasOptions: true,
  missing: true,
};

const detectResult: DetectResult = {
  chromeFound: true,
  items: [
    {
      chromeId: "aaaaaaaaaaaaaaaa",
      profile: "Default",
      name: "未追加の候補",
      path: "C:\\chrome\\aaaa",
      hasPopup: true,
      hasOptions: false,
      added: false,
    },
    {
      chromeId: "abcdefghijklmnop",
      profile: "Default",
      name: "Chrome由来の拡張",
      path: "C:\\chrome\\abcd",
      hasPopup: false,
      hasOptions: true,
      added: true,
    },
  ],
};

// アプリは documentElement の data-theme でテーマを切り替えるため、Story でもそれに合わせる
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

/** 実際の一覧と同様に、変更操作の後で一覧が更新されるサービスのスタブ */
function createStatefulServices(initial: ExtensionEntry[]) {
  let current = initial;
  return {
    reset: () => {
      current = initial;
    },
    listExtensions: fn(async () => current),
    pickFolder: fn(async () => "C:\\extensions\\picked"),
    addFromFolder: fn(async () => {
      const added: ExtensionEntry = {
        ...folderExtension,
        id: "e-new",
        name: "新しく追加した拡張",
      };
      current = [...current, added];
      return added;
    }),
    setEnabled: fn(async (id: string, enabled: boolean) => {
      current = current.map((e) => (e.id === id ? { ...e, enabled } : e));
    }),
    remove: fn(async (id: string) => {
      current = current.filter((e) => e.id !== id);
    }),
  };
}

const services = createStatefulServices([
  folderExtension,
  chromeExtension,
  missingExtension,
]);

const meta: Meta<typeof ExtensionsTab> = {
  title: "Components/AppSettingsPanel/ExtensionsTab",
  component: ExtensionsTab,
  parameters: { layout: "fullscreen" },
  args: {
    accountId: "acc-1",
    onExtensionsChanged: fn(),
    listExtensions: fn(async () => [
      folderExtension,
      chromeExtension,
      missingExtension,
    ]),
    detectChromeExtensions: fn(async () => detectResult),
    pickFolder: fn(async () => "C:\\extensions\\picked"),
    addFromFolder: fn(async () => folderExtension),
    addChrome: fn(async () => chromeExtension),
    setEnabled: fn(async () => undefined),
    remove: fn(async () => undefined),
    openPage: fn(async () => undefined),
  },
};

export default meta;
type Story = StoryObj<typeof ExtensionsTab>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("フォルダから追加した拡張"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(MISSING_BADGE_TEXT)).toBeInTheDocument();
    // 追加時の信頼に関する注意が表示される
    await expect(canvas.getByRole("note")).toHaveTextContent(TRUST_NOTICE);
    // ポップアップを持たない拡張には「ポップアップを開く」が出ない
    await expect(
      canvas.queryByRole("button", {
        name: "Chrome由来の拡張 のポップアップを開く",
      }),
    ).toBeNull();
  },
};

export const Empty: Story = {
  name: "追加済みの拡張機能が無い",
  args: { listExtensions: fn(async () => []) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("追加済みの拡張機能はありません"),
    ).toBeInTheDocument();
  },
};

export const ChromeCandidates: Story = {
  name: "Chromeの候補が表示される",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Chrome から検出" }),
    );
    await expect(await canvas.findByText("未追加の候補")).toBeInTheDocument();
    await expect(canvas.getByText(ADDED_BADGE_TEXT)).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Chrome由来の拡張 を追加" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "未追加の候補 を追加" }),
    );
    await waitFor(() =>
      expect(args.addChrome).toHaveBeenCalledWith("aaaaaaaaaaaaaaaa"),
    );
    await waitFor(() => expect(args.onExtensionsChanged).toHaveBeenCalled());
  },
};

export const ChromeNotFound: Story = {
  name: "Chromeが見つからない",
  args: {
    detectChromeExtensions: fn(async () => ({ chromeFound: false, items: [] })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Chrome から検出" }),
    );
    await expect(
      await canvas.findByText(CHROME_NOT_FOUND_NOTICE),
    ).toBeInTheDocument();
  },
};

export const ErrorOnAdd: Story = {
  name: "追加に失敗するとエラーが表示される",
  args: {
    addFromFolder: fn(async () => {
      throw "manifest.json が見つかりません";
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "フォルダを指定して追加" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "manifest.json が見つかりません",
    );
    await expect(args.onExtensionsChanged).not.toHaveBeenCalled();
  },
};

export const MissingBadge: Story = {
  name: "Chrome側で削除された拡張は見つかりません表示で操作できない",
  args: { listExtensions: fn(async () => [missingExtension]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(MISSING_BADGE_TEXT),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", {
        name: "Chromeから消えた拡張 のポップアップを開く",
      }),
    ).toBeDisabled();
  },
};

export const Busy: Story = {
  name: "処理中は操作ボタンが無効になる",
  args: {
    remove: fn(() => new Promise<void>(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const removeBtn = await canvas.findByRole("button", {
      name: "フォルダから追加した拡張 を削除",
    });
    await userEvent.click(removeBtn);
    await expect(removeBtn).toBeDisabled();
    await expect(removeBtn).toHaveAttribute("aria-busy", "true");
    await expect(
      canvas.getByRole("button", { name: "フォルダを指定して追加" }),
    ).toBeDisabled();
  },
};

export const NoAccount: Story = {
  name: "開くアカウントが無いとポップアップとオプションが無効",
  args: { accountId: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const popup = await canvas.findByRole("button", {
      name: "フォルダから追加した拡張 のポップアップを開く",
    });
    await expect(popup).toBeDisabled();
    await expect(popup).toHaveAttribute(
      "title",
      "アカウントを選択してください",
    );
  },
};

export const Operations: Story = {
  name: "追加・トグル・ポップアップ起動・削除ができる",
  // 再実行しても同じ初期状態から始められるよう、描画前に一覧を戻す
  loaders: [
    () => {
      services.reset();
      return {};
    },
  ],
  args: {
    listExtensions: services.listExtensions,
    pickFolder: services.pickFolder,
    addFromFolder: services.addFromFolder,
    setEnabled: services.setEnabled,
    remove: services.remove,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // 追加
    await userEvent.click(
      await canvas.findByRole("button", { name: "フォルダを指定して追加" }),
    );
    await expect(
      await canvas.findByText("新しく追加した拡張"),
    ).toBeInTheDocument();
    await expect(args.addFromFolder).toHaveBeenCalledWith(
      "C:\\extensions\\picked",
    );
    // トグル（有効 → 無効）
    await userEvent.click(
      canvas.getByRole("checkbox", {
        name: "フォルダから追加した拡張 を有効にする",
      }),
    );
    await waitFor(() =>
      expect(args.setEnabled).toHaveBeenCalledWith("e1", false),
    );
    // 無効にしたのでポップアップは開けない
    await waitFor(() =>
      expect(
        canvas.getByRole("button", {
          name: "フォルダから追加した拡張 のポップアップを開く",
        }),
      ).toBeDisabled(),
    );
    // 有効な拡張のポップアップ起動（accountId 付き）
    await userEvent.click(
      canvas.getByRole("button", {
        name: "新しく追加した拡張 のポップアップを開く",
      }),
    );
    await waitFor(() =>
      expect(args.openPage).toHaveBeenCalledWith("e-new", "popup", "acc-1"),
    );
    // 削除
    await userEvent.click(
      canvas.getByRole("button", { name: "新しく追加した拡張 を削除" }),
    );
    await waitFor(() => expect(args.remove).toHaveBeenCalledWith("e-new"));
    await waitFor(() =>
      expect(canvas.queryByText("新しく追加した拡張")).toBeNull(),
    );
  },
};

export const Light: Story = {
  name: "ライトテーマ",
  decorators: [
    (Story) => (
      <ThemeRoot theme="light">
        <Story />
      </ThemeRoot>
    ),
  ],
};

export const Dark: Story = {
  name: "ダークテーマ",
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
};

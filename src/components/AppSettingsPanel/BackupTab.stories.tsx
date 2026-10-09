import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  BackupTab,
  EXPORT_PRIVACY_NOTICE,
  NO_CREDENTIALS_NOTICE,
  REAUTH_HINT,
  REPLACE_WARNING,
} from "@/components/AppSettingsPanel/BackupTab";
import type { BackupContent, RestoreMapping } from "@/lib/backupRestore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Account, Column } from "@/types";

function column(
  id: string,
  accountId: string,
  pageType: Column["pageType"] = "home",
): Column {
  return {
    id,
    accountId,
    pageType,
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: DEFAULT_COLUMN_SETTINGS,
  };
}

const {
  windowBounds: _windowBounds,
  pendingDataDirectoryDeletions: _pending,
  hardwareVideoDecodeEnabled: _hardwareVideoDecode,
  h264DownloadPromptDismissed: _h264Dismissed,
  ...portableSettings
} = DEFAULT_GLOBAL_SETTINGS;

const content: BackupContent = {
  accounts: [
    {
      backupAccountId: "A",
      label: "メインアカウント",
      color: "#1d9bf0",
      xUserId: "100",
    },
    { backupAccountId: "B", label: "サブアカウント", color: "#e0245e" },
  ],
  columns: [
    column("a1", "A"),
    column("a2", "A", "notifications"),
    column("b1", "B"),
    column("ext", "ext", "external"),
  ],
  globalSettings: portableSettings,
};

const accounts: Account[] = [
  {
    id: "t1",
    label: "端末のアカウント1",
    dataDirectory: "/data/t1",
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
    xUserId: "100",
  },
  {
    id: "t2",
    label: "端末のアカウント2",
    dataDirectory: "/data/t2",
    color: "#e0245e",
    createdAt: "2026-01-02T00:00:00Z",
  },
];

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

// 紐づけの選択に応じて表示が変わることを確認するため、状態を持つラッパーで描画する
function StatefulMapping(
  props: React.ComponentProps<typeof BackupTab> & {
    initialMapping: RestoreMapping;
  },
) {
  const { initialMapping, onChangeMapping, ...rest } = props;
  const [mapping, setMapping] = useState(initialMapping);
  return (
    <BackupTab
      {...rest}
      mapping={mapping}
      onChangeMapping={(backupId, targetId) => {
        onChangeMapping(backupId, targetId);
        setMapping((prev) => ({ ...prev, [backupId]: targetId }));
      }}
    />
  );
}

const meta: Meta<typeof BackupTab> = {
  title: "Components/AppSettingsPanel/BackupTab",
  component: BackupTab,
  parameters: { layout: "fullscreen" },
  args: {
    accounts,
    step: "idle",
    content: null,
    mapping: {},
    busy: false,
    saveBlocked: false,
    message: null,
    onExport: fn(),
    onPickFile: fn(),
    onChangeMapping: fn(),
    onCancel: fn(),
    onProceedToConfirm: fn(),
    onBackToMapping: fn(),
    onExecute: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof BackupTab>;

export const Default: Story = {
  name: "初期表示",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(EXPORT_PRIVACY_NOTICE)).toBeInTheDocument();
    await expect(
      canvas.getAllByText(NO_CREDENTIALS_NOTICE).length,
    ).toBeGreaterThan(0);
    await userEvent.click(
      canvas.getByRole("button", { name: "バックアップを書き出す" }),
    );
    await expect(args.onExport).toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "バックアップファイルを選択" }),
    );
    await expect(args.onPickFile).toHaveBeenCalled();
  },
};

export const MappingNothingSelected: Story = {
  name: "紐づけ画面（紐づけなしでは進めない）",
  args: { step: "mapping", content },
  render: (args) => (
    <StatefulMapping {...args} initialMapping={{ A: null, B: null }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("メインアカウント")).toBeInTheDocument();
    await expect(canvas.getByText("カラム 2 件")).toBeInTheDocument();
    await expect(canvas.getByText("カラム 1 件")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "確認へ進む" }),
    ).toBeDisabled();
    // 紐づけると進めるようになる
    await userEvent.selectOptions(
      canvas.getByLabelText("メインアカウント の復元先"),
      "t1",
    );
    await expect(
      canvas.getByRole("button", { name: "確認へ進む" }),
    ).toBeEnabled();
    // 端末のアカウント2はXユーザー IDが未取得のため、再認証のヒントが出る
    await expect(canvas.getByText(REAUTH_HINT)).toBeInTheDocument();
  },
};

export const MappingSharedTarget: Story = {
  name: "紐づけ画面（同じ復元先の重複を警告）",
  args: { step: "mapping", content },
  render: (args) => (
    <StatefulMapping {...args} initialMapping={{ A: "t1", B: "t1" }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/同じ復元先に複数のバックアップ内アカウント/),
    ).toBeInTheDocument();
    // 重複を解消すると警告が消える
    await userEvent.selectOptions(
      canvas.getByLabelText("サブアカウント の復元先"),
      "",
    );
    await expect(
      canvas.queryByText(/同じ復元先に複数のバックアップ内アカウント/),
    ).not.toBeInTheDocument();
  },
};

export const MappingAutoSuggested: Story = {
  name: "紐づけ画面（Xユーザー IDの一致で初期選択）",
  args: { step: "mapping", content },
  render: (args) => (
    <StatefulMapping {...args} initialMapping={{ A: "t1", B: null }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText("メインアカウント の復元先"),
    ).toHaveValue("t1");
    await expect(canvas.getByLabelText("サブアカウント の復元先")).toHaveValue(
      "",
    );
  },
};

export const Confirm: Story = {
  name: "確認画面",
  args: { step: "confirm", content, mapping: { A: "t1", B: null } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("復元されるカラム 3 件 / スキップ 1 件"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(REPLACE_WARNING)).toBeInTheDocument();
    await expect(canvas.getByText(NO_CREDENTIALS_NOTICE)).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "置き換えて復元" }),
    );
    await expect(args.onExecute).toHaveBeenCalled();
  },
};

export const SaveBlocked: Story = {
  name: "設定の読み込み失敗（読み込みを無効化）",
  args: { saveBlocked: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "バックアップファイルを選択" }),
    ).toBeDisabled();
  },
};

export const ErrorMessage: Story = {
  name: "読み込み失敗のメッセージ",
  args: {
    message: {
      kind: "error",
      text: "このバックアップは新しいバージョンのアプリで作成されています。アプリを更新してください。",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "アプリを更新してください",
    );
  },
};

export const LightTheme: Story = {
  name: "ライトテーマ",
  args: { step: "mapping", content },
  render: (args) => (
    <ThemeRoot theme="light">
      <StatefulMapping {...args} initialMapping={{ A: "t1", B: "t1" }} />
    </ThemeRoot>
  ),
};

export const DarkTheme: Story = {
  name: "ダークテーマ",
  args: { step: "mapping", content },
  render: (args) => (
    <ThemeRoot theme="dark">
      <StatefulMapping {...args} initialMapping={{ A: "t1", B: "t1" }} />
    </ThemeRoot>
  ),
};

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BackupContent } from "@/lib/backupRestore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Account, Column } from "@/types";
import {
  BackupTab,
  EXPORT_PRIVACY_NOTICE,
  NO_CREDENTIALS_NOTICE,
  REAUTH_HINT,
  REPLACE_WARNING,
  SAVE_BLOCKED_NOTICE,
} from "./BackupTab";

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
  ...PORTABLE_SETTINGS
} = DEFAULT_GLOBAL_SETTINGS;

const content: BackupContent = {
  accounts: [
    { backupAccountId: "A", label: "アカウントA", color: "#1d9bf0" },
    { backupAccountId: "B", label: "アカウントB", color: "#e0245e" },
  ],
  columns: [
    column("a1", "A"),
    column("a2", "A"),
    column("b1", "B"),
    column("ext", "ext", "external"),
  ],
  globalSettings: PORTABLE_SETTINGS,
};

function target(id: string, label: string, xUserId?: string): Account {
  return {
    id,
    label,
    dataDirectory: `/data/${id}`,
    color: "#000",
    createdAt: "2026-01-01T00:00:00Z",
    xUserId,
  };
}

function renderTab(
  overrides: Partial<React.ComponentProps<typeof BackupTab>> = {},
) {
  const props: React.ComponentProps<typeof BackupTab> = {
    accounts: [target("t1", "復元先1", "1"), target("t2", "復元先2", "2")],
    step: "idle",
    content: null,
    mapping: {},
    busy: false,
    saveBlocked: false,
    message: null,
    onExport: vi.fn(),
    onPickFile: vi.fn(),
    onChangeMapping: vi.fn(),
    onCancel: vi.fn(),
    onProceedToConfirm: vi.fn(),
    onBackToMapping: vi.fn(),
    onExecute: vi.fn(),
    ...overrides,
  };
  render(<BackupTab {...props} />);
  return props;
}

describe("BackupTab 初期表示", () => {
  it("ログイン情報が含まれない旨と、共有時の個人情報への注意を表示する", () => {
    renderTab();

    expect(screen.getAllByText(NO_CREDENTIALS_NOTICE).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(EXPORT_PRIVACY_NOTICE)).toBeInTheDocument();
  });

  it("書き出しとファイル選択のボタンがそれぞれのコールバックを呼ぶ", () => {
    const props = renderTab();

    fireEvent.click(
      screen.getByRole("button", { name: "バックアップを書き出す" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "バックアップファイルを選択" }),
    );

    expect(props.onExport).toHaveBeenCalledTimes(1);
    expect(props.onPickFile).toHaveBeenCalledTimes(1);
  });

  it("設定の読み込み失敗で保存が止まっているときは読み込みを無効にして理由を表示する", () => {
    renderTab({ saveBlocked: true });

    expect(
      screen.getByRole("button", { name: "バックアップファイルを選択" }),
    ).toBeDisabled();
    expect(screen.getByText(SAVE_BLOCKED_NOTICE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "バックアップを書き出す" }),
    ).toBeEnabled();
  });

  it("処理結果のメッセージを表示する", () => {
    renderTab({ message: { kind: "error", text: "読み込めませんでした" } });

    expect(screen.getByRole("alert")).toHaveTextContent("読み込めませんでした");
  });
});

describe("BackupTab 紐づけ画面", () => {
  it("各行にラベルとカラム数を表示する（外部カラムは数えない）", () => {
    renderTab({ step: "mapping", content, mapping: { A: null, B: null } });

    expect(screen.getByText("アカウントA")).toBeInTheDocument();
    expect(screen.getByText("カラム 2 件")).toBeInTheDocument();
    expect(screen.getByText("カラム 1 件")).toBeInTheDocument();
  });

  it("復元先のログイン済みアカウントか「復元しない」を選べる", () => {
    const props = renderTab({
      step: "mapping",
      content,
      mapping: { A: null, B: null },
    });
    const select = screen.getByLabelText("アカウントA の復元先");

    expect(
      Array.from((select as HTMLSelectElement).options).map((o) => o.text),
    ).toEqual(["復元しない", "復元先1", "復元先2"]);
    fireEvent.change(select, { target: { value: "t2" } });

    expect(props.onChangeMapping).toHaveBeenCalledWith("A", "t2");
  });

  it("「復元しない」を選ぶと null で通知する", () => {
    const props = renderTab({
      step: "mapping",
      content,
      mapping: { A: "t1", B: null },
    });

    fireEvent.change(screen.getByLabelText("アカウントA の復元先"), {
      target: { value: "" },
    });

    expect(props.onChangeMapping).toHaveBeenCalledWith("A", null);
  });

  it("紐づけが1件もないときは確認へ進めず理由を表示する", () => {
    renderTab({ step: "mapping", content, mapping: { A: null, B: null } });

    expect(screen.getByRole("button", { name: "確認へ進む" })).toBeDisabled();
    expect(
      screen.getByText(/紐づけが1件もないため復元できません/),
    ).toBeInTheDocument();
  });

  it("紐づけが1件あれば確認へ進める", () => {
    const props = renderTab({
      step: "mapping",
      content,
      mapping: { A: "t1", B: null },
    });

    fireEvent.click(screen.getByRole("button", { name: "確認へ進む" }));

    expect(props.onProceedToConfirm).toHaveBeenCalledTimes(1);
  });

  it("同じ復元先に複数のバックアップ内アカウントを割り当てると警告を表示する", () => {
    renderTab({ step: "mapping", content, mapping: { A: "t1", B: "t1" } });

    expect(
      screen.getByText(
        /同じ復元先に複数のバックアップ内アカウントが割り当てられています/,
      ),
    ).toBeInTheDocument();
  });

  it("重複がなければ警告を表示しない", () => {
    renderTab({ step: "mapping", content, mapping: { A: "t1", B: "t2" } });

    expect(
      screen.queryByText(/同じ復元先に複数のバックアップ内アカウント/),
    ).not.toBeInTheDocument();
  });

  it("Xユーザー ID未取得の復元先があるときは再認証のヒントを表示する", () => {
    renderTab({
      step: "mapping",
      content,
      mapping: { A: null, B: null },
      accounts: [target("t1", "復元先1")],
    });

    expect(screen.getByText(REAUTH_HINT)).toBeInTheDocument();
  });

  it("全ての復元先にXユーザー IDがあれば再認証のヒントを表示しない", () => {
    renderTab({ step: "mapping", content, mapping: { A: null, B: null } });

    expect(screen.queryByText(REAUTH_HINT)).not.toBeInTheDocument();
  });

  it("キャンセルでコールバックが呼ばれる", () => {
    const props = renderTab({
      step: "mapping",
      content,
      mapping: { A: "t1", B: null },
    });

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("BackupTab 確認画面", () => {
  it("復元されるカラム件数とスキップ件数、全置換の警告、ログイン情報の注意を表示する", () => {
    renderTab({ step: "confirm", content, mapping: { A: "t1", B: null } });

    expect(
      screen.getByText("復元されるカラム 3 件 / スキップ 1 件"),
    ).toBeInTheDocument();
    expect(screen.getByText(REPLACE_WARNING)).toBeInTheDocument();
    expect(screen.getByText(NO_CREDENTIALS_NOTICE)).toBeInTheDocument();
  });

  it("置き換えて復元で実行コールバックが呼ばれ、戻るで紐づけ画面へ戻る", () => {
    const props = renderTab({
      step: "confirm",
      content,
      mapping: { A: "t1", B: null },
    });

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "置き換えて復元" }));

    expect(props.onBackToMapping).toHaveBeenCalledTimes(1);
    expect(props.onExecute).toHaveBeenCalledTimes(1);
  });

  it("実行中は復元ボタンを無効にする", () => {
    renderTab({
      step: "confirm",
      content,
      mapping: { A: "t1", B: null },
      busy: true,
    });

    expect(
      screen.getByRole("button", { name: "置き換えて復元" }),
    ).toBeDisabled();
  });
});

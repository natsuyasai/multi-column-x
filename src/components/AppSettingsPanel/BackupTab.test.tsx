import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { BackupContent } from "@/lib/backupRestore";
import { expectNoJapanese } from "@/test-utils/japanese";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Account, Column } from "@/types";
import { BackupTab } from "./BackupTab";

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

function baseProps(): React.ComponentProps<typeof BackupTab> {
  return {
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
  };
}

function renderTab(
  overrides: Partial<React.ComponentProps<typeof BackupTab>> = {},
) {
  const props = { ...baseProps(), ...overrides };
  render(<BackupTab {...props} />);
  return props;
}

describe("BackupTab 初期表示", () => {
  it("ログイン情報が含まれない旨と、共有時の個人情報への注意を表示する", () => {
    renderTab();

    expect(
      screen.getAllByText(i18n.t("settings:backup.noCredentials")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(i18n.t("settings:backup.exportPrivacy")),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText(i18n.t("settings:backup.saveBlocked")),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(i18n.t("settings:backup.reauthHint")),
    ).toBeInTheDocument();
  });

  it("全ての復元先にXユーザー IDがあれば再認証のヒントを表示しない", () => {
    renderTab({ step: "mapping", content, mapping: { A: null, B: null } });

    expect(
      screen.queryByText(i18n.t("settings:backup.reauthHint")),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByText(i18n.t("settings:backup.replaceWarning")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("settings:backup.noCredentials")),
    ).toBeInTheDocument();
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

describe("BackupTab 日本語表示の文言", () => {
  it("書き出しと復元の説明文が従来と同じ日本語で表示される", () => {
    renderTab({ saveBlocked: true });

    expect(
      screen.getByText(
        "アカウント情報（名前・色）・カラム構成・設定を1つのファイルに書き出します。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "バックアップファイルにはアカウント名・NGワード・リポスト非表示ユーザーなどの個人情報が含まれます。共有・保管するときは取り扱いに注意してください。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "設定を読み込めていないため、バックアップの読み込みと復元はできません。アプリを再起動してください。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "このバックアップにはログイン情報は含まれません。復元先で事前にログインしてください",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("紐づけ画面と確認画面の説明文が従来と同じ日本語で表示される", () => {
    const { unmount } = render(
      <BackupTab
        {...baseProps()}
        step="mapping"
        content={content}
        mapping={{ A: "t1", B: "t1" }}
      />,
    );

    expect(
      screen.getByText(
        "バックアップ内のアカウントごとに、復元先のログイン済みアカウントを選んでください。 「復元しない」を選んだアカウントのカラムは復元されません。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "同じ復元先に複数のバックアップ内アカウントが割り当てられています（復元先1）。意図した紐づけか確認してください。",
      ),
    ).toBeInTheDocument();
    unmount();

    render(
      <BackupTab
        {...baseProps()}
        step="confirm"
        content={content}
        mapping={{ A: "t1", B: null }}
      />,
    );
    expect(
      screen.getByText(
        "現在のカラムと設定（ウィンドウ位置を除く）はすべてバックアップの内容に置き換わります。アカウントは置き換わりません。復元直前の設定は自動で退避されます。",
      ),
    ).toBeInTheDocument();
  });
});

describe("BackupTab 英語表示", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("ja");
    });
  });

  async function useEnglish() {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  }

  // アカウント名はユーザーデータなので翻訳されない。日本語の検査にかからないよう英語名を使う
  const englishContent: BackupContent = {
    ...content,
    accounts: [
      { backupAccountId: "A", label: "Account A", color: "#1d9bf0" },
      { backupAccountId: "B", label: "Account B", color: "#e0245e" },
    ],
  };

  it("表示言語が英語のとき書き出しと復元の初期画面に日本語の文言が表示されない", async () => {
    await useEnglish();
    renderTab();

    expect(
      screen.getByRole("button", { name: "Export backup" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select backup file" }),
    ).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき保存が止まっている状態とメッセージに日本語の文言が表示されない", async () => {
    await useEnglish();
    // メッセージ本文は呼び出し元の hook が決めるため、英語のテストデータで固定の文言だけを検査する
    renderTab({
      saveBlocked: true,
      message: { kind: "error", text: "Failed to read the file" },
    });

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき紐づけ画面の各状態に日本語の文言が表示されない", async () => {
    await useEnglish();
    renderTab({
      step: "mapping",
      content: englishContent,
      mapping: { A: "t1", B: "t1" },
      accounts: [target("t1", "Target 1")],
    });

    expect(screen.getByText("Link accounts")).toBeInTheDocument();
    expect(screen.getByText("1 column")).toBeInTheDocument();
    expect(screen.getByText("2 columns")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: "Restore destination for Account A",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("option", { name: "Don't restore" }),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        "Multiple accounts in the backup are assigned to the same destination (Target 1). Check that this is intended.",
      ),
    ).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき復元先が無い・紐づけが無い状態に日本語の文言が表示されない", async () => {
    await useEnglish();
    renderTab({
      step: "mapping",
      content: englishContent,
      mapping: { A: null, B: null },
      accounts: [],
    });

    expect(
      screen.getByText(/no logged-in accounts to restore to/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing is linked/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to confirmation" }),
    ).toBeDisabled();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき再認証のヒントに日本語の文言が表示されない", async () => {
    await useEnglish();
    renderTab({
      step: "mapping",
      content: englishContent,
      mapping: { A: "t1", B: null },
      accounts: [target("t1", "Target 1")],
    });

    expect(
      screen.getByText(/Re-authenticate those accounts/),
    ).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき確認画面に日本語の文言が表示されない", async () => {
    await useEnglish();
    renderTab({
      step: "confirm",
      content: englishContent,
      mapping: { A: "t1", B: null },
      accounts: [target("t1", "Target 1", "1")],
      message: { kind: "warning", text: "Not changed" },
    });

    expect(
      screen.getByText("Columns to restore: 3 / Skipped: 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace and restore" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("画面を開いたまま言語を切り替えるとバックアップタブの文言も切り替わる", async () => {
    renderTab();
    expect(
      screen.getByRole("button", { name: "バックアップを書き出す" }),
    ).toBeInTheDocument();

    await useEnglish();

    expect(
      screen.getByRole("button", { name: "Export backup" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "バックアップを書き出す" }),
    ).not.toBeInTheDocument();
  });
});

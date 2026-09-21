import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Account, Column, GlobalSettings } from "../../types";
import { DEFAULT_COLUMN_SETTINGS } from "../../types";
import { AddColumnDialog } from "./AddColumnDialog";

const mockAccounts: Account[] = [
  {
    id: "acc-1",
    label: "アカウントA",
    dataDirectory: "/data/a",
    color: "#1d9bf0",
    createdAt: "2026-05-02T00:00:00Z",
  },
];

const mockGlobalSettings: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 60,
  defaultShowCountdown: true,
  defaultHideHeaderEnabled: true,
  defaultHideTweetInputEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: true,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: false,
  imagePopupEnabled: true,
  videoPopupEnabled: true,
  showSortButtons: true,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: false,
  apiRateLimitMonitorEnabled: true,
  columnScale: "default",
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
  mobileSwipeAreaOpacity: 50,
  mobileTwoColumnEnabled: true,
  presets: [],
  ngWords: [],
  repostHiddenUserIds: [],
};

describe("AddColumnDialog", () => {
  it("アカウント一覧が表示される", () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("アカウントA")).toBeInTheDocument();
  });

  it("homeを選択するとタブ名入力欄が表示される", () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // デフォルトはhomeなのでタブ名欄がすでに表示されているはず
    expect(
      screen.getByRole("textbox", { name: /タブ名（任意）/ }),
    ).toBeInTheDocument();
  });

  it("EscキーでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("投稿を選んで追加するとpageTypeがcomposeのカラムが作られる", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "投稿",
    );
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({ pageType: "compose" }),
    );
  });

  it("検索を選んで追加すると最新タブ指定つきの検索カラムが作られる", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "検索",
    );
    await userEvent.type(screen.getByLabelText("検索クエリ"), "rust");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({
        pageType: "search",
        searchQuery: "rust",
        searchLiveTab: true,
      }),
    );
  });

  it("検索以外を選んで追加すると最新タブ指定は付かない", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0][0] as Column;
    expect(added.pageType).toBe("home");
    expect(added.searchLiveTab).toBeUndefined();
  });

  it("グローバル設定のdefaultHideHeaderEnabledとdefaultHideTweetInputEnabledがそれぞれ独立して新規カラムの設定にコピーされる", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={{
          ...mockGlobalSettings,
          defaultHideHeaderEnabled: true,
          defaultHideTweetInputEnabled: false,
        }}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({
        settings: expect.objectContaining({
          hideHeaderEnabled: true,
          hideTweetInputEnabled: false,
        }) as Column["settings"],
      }),
    );
  });

  it("キャンセルボタンでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("外部urlを選択するとアカウント選択欄が非表示になる", async () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("アカウント")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    expect(screen.queryByLabelText("アカウント")).not.toBeInTheDocument();
  });

  it("外部urlを選択するとurl入力欄が表示される", async () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });

  it("外部urlで追加するとaccountIdがcolumn自身のidと一致する", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    await userEvent.type(screen.getByLabelText("URL"), "https://example.com/");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalled();
    const column = onAdd.mock.calls[0][0] as Column;
    expect(column.accountId).toBe(column.id);
  });

  it("外部urlで追加するとcustomcss以外の設定項目が無効値になる", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    await userEvent.type(screen.getByLabelText("URL"), "https://example.com/");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({
        settings: {
          ...DEFAULT_COLUMN_SETTINGS,
          customCSS: mockGlobalSettings.defaultColumnCustomCSS,
        },
      }),
    );
  });

  it("外部urlで追加するとcustomurlが設定される", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    await userEvent.type(screen.getByLabelText("URL"), "https://example.com/");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({
        customUrl: "https://example.com/",
      }),
    );
  });

  it("アカウントが0件でも外部urlは追加ボタンが有効になる", async () => {
    render(
      <AddColumnDialog
        accounts={[]}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    expect(screen.getByRole("button", { name: "追加" })).not.toBeDisabled();
  });

  it("アカウントが0件で外部url以外の場合は追加ボタンが無効になる", () => {
    render(
      <AddColumnDialog
        accounts={[]}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
  });

  it("表示名を入力して追加するとonAddに渡るcolumn.labelがその値になる", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    const labelInput = screen.getByRole("textbox", { name: /表示名（任意）/ });
    await userEvent.type(labelInput, "仕事用");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({ label: "仕事用" }),
    );
  });

  it("表示名を入力しない場合column.labelはundefinedになる", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({ label: undefined }),
    );
  });

  it("空白のみの表示名はcolumn.labelがundefinedになる", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    const labelInput = screen.getByRole("textbox", { name: /表示名（任意）/ });
    await userEvent.type(labelInput, "   ");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({ label: undefined }),
    );
  });

  it("前後の空白は除去される", async () => {
    const onAdd = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );
    const labelInput = screen.getByRole("textbox", { name: /表示名（任意）/ });
    await userEvent.type(labelInput, "  仕事用  ");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Column>>({ label: "仕事用" }),
    );
  });

  it("ページタイプが外部URLのときも表示名欄が表示される", async () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "外部URL（アカウント非依存）",
    );
    expect(
      screen.getByRole("textbox", { name: /表示名（任意）/ }),
    ).toBeInTheDocument();
  });

  it("ページタイプが投稿（compose）のときも表示名欄が表示される", async () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("ページタイプ"),
      "投稿",
    );
    expect(
      screen.getByRole("textbox", { name: /表示名（任意）/ }),
    ).toBeInTheDocument();
  });

  it("表示名欄にmaxLengthが30で設定されている", () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        existingColumns={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const labelInput = screen.getByRole("textbox", { name: /表示名（任意）/ });
    expect(labelInput).toHaveAttribute("maxLength", "30");
  });
});

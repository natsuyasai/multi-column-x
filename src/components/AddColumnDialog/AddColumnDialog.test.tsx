import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddColumnDialog } from "./AddColumnDialog";
import type { Account, GlobalSettings } from "../../types";

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
};

describe("AddColumnDialog", () => {
  it("アカウント一覧が表示される", () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
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
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // デフォルトはhomeなのでタブ名欄がすでに表示されているはず
    expect(
      screen.getByRole("textbox", { name: /タブ名（任意）/ }),
    ).toBeInTheDocument();
  });

  it("キャンセルボタンでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        globalSettings={mockGlobalSettings}
        onAdd={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalled();
  });
});

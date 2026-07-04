import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ColumnPreset } from "../../types";
import { PresetsTab } from "./PresetsTab";

const mockPresets: ColumnPreset[] = [
  {
    id: "preset-1",
    name: "ホームレイアウト",
    columns: [],
  },
  {
    id: "preset-2",
    name: "通知レイアウト",
    columns: [],
  },
];

describe("PresetsTab", () => {
  it("プリセット名入力フィールドが表示される", () => {
    render(
      <PresetsTab
        presets={[]}
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("プリセット名を入力"),
    ).toBeInTheDocument();
  });

  it("名前が空の場合は保存ボタンが無効", () => {
    render(
      <PresetsTab
        presets={[]}
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const saveBtn = screen.getByRole("button", {
      name: "現在のレイアウトを保存",
    });
    expect(saveBtn).toBeDisabled();
  });

  it("名前を入力すると保存ボタンが有効になる", () => {
    render(
      <PresetsTab
        presets={[]}
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("プリセット名を入力"), {
      target: { value: "マイレイアウト" },
    });
    expect(
      screen.getByRole("button", { name: "現在のレイアウトを保存" }),
    ).not.toBeDisabled();
  });

  it("保存ボタンクリックでonSaveが呼ばれる", () => {
    const onSave = vi.fn();
    render(
      <PresetsTab
        presets={[]}
        onSave={onSave}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("プリセット名を入力"), {
      target: { value: "マイレイアウト" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "現在のレイアウトを保存" }),
    );
    expect(onSave).toHaveBeenCalledWith("マイレイアウト");
  });

  it("プリセット一覧が表示される", () => {
    render(
      <PresetsTab
        presets={mockPresets}
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("ホームレイアウト")).toBeInTheDocument();
    expect(screen.getByText("通知レイアウト")).toBeInTheDocument();
  });

  it("読み込みボタンクリックでonLoadが呼ばれる", () => {
    const onLoad = vi.fn();
    render(
      <PresetsTab
        presets={mockPresets}
        onSave={vi.fn()}
        onLoad={onLoad}
        onDelete={vi.fn()}
      />,
    );
    const loadButtons = screen.getAllByRole("button", { name: "読み込む" });
    fireEvent.click(loadButtons[0]);
    expect(onLoad).toHaveBeenCalledWith("preset-1");
  });

  it("削除ボタンクリックでonDeleteが呼ばれる", () => {
    const onDelete = vi.fn();
    render(
      <PresetsTab
        presets={mockPresets}
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={onDelete}
      />,
    );
    const deleteButtons = screen.getAllByRole("button", { name: "削除" });
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith("preset-1");
  });

  it("プリセットがない場合はメッセージが表示される", () => {
    render(
      <PresetsTab
        presets={[]}
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.getByText("保存済みプリセットはありません"),
    ).toBeInTheDocument();
  });
});

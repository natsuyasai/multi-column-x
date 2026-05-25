import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Column } from "../../types";
import { SettingsPanel } from "./SettingsPanel";

const baseSettings = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: true,
  areaRemoveEnabled: false,
  showCustomMenu: false,
  scrollPosRestoreEnabled: false,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
};

const mockColumn: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: baseSettings,
};

const defaultProps = {
  column: mockColumn,
  onApply: vi.fn(),
  onClose: vi.fn(),
  isMobile: false,
};

describe("SettingsPanel", () => {
  it("EscキーでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("再読み込みボタンが表示される", () => {
    render(<SettingsPanel {...defaultProps} onReload={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "再読み込み" }),
    ).toBeInTheDocument();
  });

  it("再読み込みボタンをクリックするとonReloadが列IDで呼ばれる", async () => {
    const onReload = vi.fn();
    render(<SettingsPanel {...defaultProps} onReload={onReload} />);
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onReload).toHaveBeenCalledWith("col-1");
  });

  it("再読み込みボタンをクリックしてもパネルは閉じない", async () => {
    const onClose = vi.fn();
    render(
      <SettingsPanel {...defaultProps} onClose={onClose} onReload={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("SettingsPanel NGワード", () => {
  it("NGワードセクションが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("NGワード")).toBeInTheDocument();
  });

  it("NGワード入力エリアが表示される", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("1行に1ワードで入力"),
    ).toBeInTheDocument();
  });

  it("既存のngWordsが入力エリアに表示される", () => {
    const col = {
      ...mockColumn,
      settings: { ...baseSettings, ngWords: ["スパム", "宣伝"] },
    };
    render(<SettingsPanel {...defaultProps} column={col} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("スパム\n宣伝");
  });

  it("適用するとngWordsが配列として渡される", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText("1行に1ワードで入力");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}bot");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
      350,
    );
  });

  it("空行は無視してngWordsに含めない", async () => {
    const onApply = vi.fn();
    render(<SettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText("1行に1ワードで入力");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}{Enter}bot");
    await userEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
      350,
    );
  });
});

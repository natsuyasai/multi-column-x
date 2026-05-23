import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppSettingsPanel } from "./AppSettingsPanel";
import type { GlobalSettings } from "../../types";

vi.mock("../../store/useAppStore", () => ({
  useAppStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      isMobile: false,
      savePreset: vi.fn(),
      loadPreset: vi.fn(),
      deletePreset: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

const baseGlobalSettings: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  defaultShowCountdown: true,
  defaultAreaRemoveEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: false,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: true,
  showSortButtons: false,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: true,
  zoomLevel: 1,
  useXAppForCompose: false,
  presets: [],
  ngWords: [],
};

const defaultProps = {
  settings: baseGlobalSettings,
  columns: [],
  accounts: [],
  onApply: vi.fn(),
  onApplyLayout: vi.fn(),
  onApplyColumnDefaults: vi.fn(),
  onReloadAllWebviews: vi.fn(),
  onClose: vi.fn(),
};

describe("AppSettingsPanel グローバルNGワード", () => {
  it("グローバルNGワードセクションが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(screen.getByText("グローバルNGワード")).toBeInTheDocument();
  });

  it("グローバルNGワード入力エリアが表示される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("1行に1ワードで入力（全カラムに適用）"),
    ).toBeInTheDocument();
  });

  it("既存のglobalNgWordsが入力エリアに表示される", () => {
    const settings = { ...baseGlobalSettings, ngWords: ["グローバルスパム", "宣伝"] };
    render(<AppSettingsPanel {...defaultProps} settings={settings} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用）",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("グローバルスパム\n宣伝");
  });

  it("適用するとngWordsが配列としてonApplyに渡される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用）",
    );
    fireEvent.change(textarea, { target: { value: "spam\nbot" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
    );
  });

  it("空行はngWordsに含めない", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const textarea = screen.getByPlaceholderText(
      "1行に1ワードで入力（全カラムに適用）",
    );
    fireEvent.change(textarea, { target: { value: "spam\n\nbot" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
    );
  });
});

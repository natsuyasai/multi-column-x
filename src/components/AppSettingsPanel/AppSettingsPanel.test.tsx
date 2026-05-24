import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppSettingsPanel } from "./AppSettingsPanel";
import type { GlobalSettings, Column, Account } from "../../types";

const mockStoreState = {
  isMobile: false,
  savePreset: vi.fn(),
  loadPreset: vi.fn(),
  deletePreset: vi.fn(),
};

vi.mock("../../store/useAppStore", () => ({
  useAppStore: vi.fn((selector?: (s: unknown) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState,
  ),
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

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  areaRemoveEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
};

const mockAccounts: Account[] = [
  {
    id: "acc-1",
    label: "テスト",
    dataDirectory: "/data",
    color: "#1d9bf0",
    createdAt: "2026-05-03T00:00:00Z",
  },
];

const mockColumns: Column[] = [
  {
    id: "c1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
  },
];

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

beforeEach(() => {
  mockStoreState.isMobile = false;
});

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
    const settings = {
      ...baseGlobalSettings,
      ngWords: ["グローバルスパム", "宣伝"],
    };
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

describe("AppSettingsPanel モバイルのカラム並び替え", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("isMobile=true でもカラム配置タブが表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    expect(
      screen.getByRole("button", { name: "カラム配置" }),
    ).toBeInTheDocument();
  });

  it("isMobile=true でカラム配置タブを開くと表示順序セクションが表示される", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "カラム配置" }));
    expect(screen.getByText("表示順序")).toBeInTheDocument();
  });

  it("isMobile=true のカラム配置タブではグリッドエディタが非表示", () => {
    render(
      <AppSettingsPanel
        {...defaultProps}
        columns={mockColumns}
        accounts={mockAccounts}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "カラム配置" }));
    // 列数入力（グリッドエディタ）が表示されない
    expect(screen.queryByText("列数:")).not.toBeInTheDocument();
  });
});

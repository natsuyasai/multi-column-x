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
  columnScale: "default",
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
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
  ngWords: [],
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
  appVersion: "0.1.0",
  updateChecking: false,
  updateManualResult: "idle" as const,
  onCheckUpdate: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  mockStoreState.isMobile = false;
});

describe("AppSettingsPanel", () => {
  it("EscキーでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
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

describe("AppSettingsPanel スワイプ切替設定", () => {
  beforeEach(() => {
    mockStoreState.isMobile = true;
  });

  it("スワイプ領域の有効トグルを切り替えるとonApplyに反映される", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const checkbox = screen.getByRole("checkbox", {
      name: "スワイプでカラム切替を有効化",
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaEnabled: false }),
    );
  });

  it("スワイプ領域の高さは16〜56にクランプされる", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    });
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaHeight: 56 }),
    );
  });

  it("スワイプ領域の高さに下限未満の値を入力すると16にクランプされる", () => {
    const onApply = vi.fn();
    render(<AppSettingsPanel {...defaultProps} onApply={onApply} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    });
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "適用" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mobileSwipeAreaHeight: 16 }),
    );
  });

  it("高さ入力を空にしても即座に補正されず入力中の値を保持できる", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "40" } });
    expect(input.value).toBe("40");
  });

  it("高さ入力からフォーカスが外れると有効範囲へ補正される", () => {
    render(<AppSettingsPanel {...defaultProps} />);
    const input = screen.getByRole("spinbutton", {
      name: "スワイプ領域の高さ(px)",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("16");
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

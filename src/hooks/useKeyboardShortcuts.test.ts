import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

type ListenCallback = (event: { payload: unknown }) => void;
let capturedListenCallback: ListenCallback | null = null;
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_event: string, cb: ListenCallback) => {
    capturedListenCallback = cb;
    return Promise.resolve(mockUnlisten);
  }),
}));

function makeProps(
  overrides: Partial<{
    onComposeTweet: () => void;
    onOpenLinkPopup: () => void;
    onAddColumn: () => void;
    onAccountManager: () => void;
    onAppSettings: () => void;
    onToggleTopBar: () => void;
    onJumpToColumn: (index: number) => void;
    disabled: boolean;
  }> = {},
) {
  return {
    onComposeTweet: vi.fn(),
    onOpenLinkPopup: vi.fn(),
    onAddColumn: vi.fn(),
    onAccountManager: vi.fn(),
    onAppSettings: vi.fn(),
    onToggleTopBar: vi.fn(),
    onJumpToColumn: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    capturedListenCallback = null;
    mockUnlisten.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Ctrl+T を押すと onComposeTweet が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(props.onComposeTweet).toHaveBeenCalledOnce();
  });

  it("Ctrl+T（大文字T）を押すと onComposeTweet が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true }),
    );
    expect(props.onComposeTweet).toHaveBeenCalledOnce();
  });

  it("T キーだけでは onComposeTweet が呼ばれない", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: false }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("Ctrl+A では onComposeTweet が呼ばれない", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("アンマウント後は Ctrl+T を押しても onComposeTweet が呼ばれない", () => {
    const props = makeProps();
    const { unmount } = renderHook(() => useKeyboardShortcuts(props));
    unmount();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("WebView から webview-keyboard-shortcut イベントを受信すると onComposeTweet が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(props.onComposeTweet).toHaveBeenCalledOnce();
  });

  it("アンマウント後は webview-keyboard-shortcut イベントを受信しても onComposeTweet が呼ばれない", async () => {
    const props = makeProps();
    const { unmount } = renderHook(() => useKeyboardShortcuts(props));
    unmount();
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("disabled=true のとき Ctrl+T を押しても onComposeTweet が呼ばれない", () => {
    const props = makeProps({ disabled: true });
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("disabled=true のとき webview イベントを受信しても onComposeTweet が呼ばれない", async () => {
    const props = makeProps({ disabled: true });
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("Ctrl+L を押すと onOpenLinkPopup が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "l", ctrlKey: true }),
    );
    expect(props.onOpenLinkPopup).toHaveBeenCalledOnce();
  });

  it("WebView から open_link_popup イベントを受信すると onOpenLinkPopup が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "open_link_popup" });
    });
    expect(props.onOpenLinkPopup).toHaveBeenCalledOnce();
  });

  it("Ctrl+N を押すと onAddColumn が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
    );
    expect(props.onAddColumn).toHaveBeenCalledOnce();
  });

  it("WebView から add_column イベントを受信すると onAddColumn が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "add_column" });
    });
    expect(props.onAddColumn).toHaveBeenCalledOnce();
  });

  it("Ctrl+Shift+A を押すと onAccountManager が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true, shiftKey: true }),
    );
    expect(props.onAccountManager).toHaveBeenCalledOnce();
  });

  it("Ctrl+A（Shift なし）では onAccountManager が呼ばれない", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        ctrlKey: true,
        shiftKey: false,
      }),
    );
    expect(props.onAccountManager).not.toHaveBeenCalled();
  });

  it("WebView から account_manager イベントを受信すると onAccountManager が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "account_manager" });
    });
    expect(props.onAccountManager).toHaveBeenCalledOnce();
  });

  it("Ctrl+, を押すと onAppSettings が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", ctrlKey: true }),
    );
    expect(props.onAppSettings).toHaveBeenCalledOnce();
  });

  it("WebView から app_settings イベントを受信すると onAppSettings が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "app_settings" });
    });
    expect(props.onAppSettings).toHaveBeenCalledOnce();
  });

  it("Ctrl+B を押すと onToggleTopBar が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", ctrlKey: true }),
    );
    expect(props.onToggleTopBar).toHaveBeenCalledOnce();
  });

  it("WebView から toggle_top_bar イベントを受信すると onToggleTopBar が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "toggle_top_bar" });
    });
    expect(props.onToggleTopBar).toHaveBeenCalledOnce();
  });

  it("Ctrl+1 を押すと onJumpToColumn(0) が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", ctrlKey: true }),
    );
    expect(props.onJumpToColumn).toHaveBeenCalledWith(0);
  });

  it("Ctrl+5 を押すと onJumpToColumn(4) が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "5", ctrlKey: true }),
    );
    expect(props.onJumpToColumn).toHaveBeenCalledWith(4);
  });

  it("Ctrl+9 を押すと onJumpToColumn(8) が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "9", ctrlKey: true }),
    );
    expect(props.onJumpToColumn).toHaveBeenCalledWith(8);
  });

  it("WebView から jump_column_1 イベントを受信すると onJumpToColumn(0) が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "jump_column_1" });
    });
    expect(props.onJumpToColumn).toHaveBeenCalledWith(0);
  });

  it("WebView から jump_column_9 イベントを受信すると onJumpToColumn(8) が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "jump_column_9" });
    });
    expect(props.onJumpToColumn).toHaveBeenCalledWith(8);
  });

  it("WebView から jump_column_0 イベントを受信しても onJumpToColumn が呼ばれない", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "jump_column_0" });
    });
    expect(props.onJumpToColumn).not.toHaveBeenCalled();
  });

  it("disabled=true のとき jump_column_1 イベントを受信しても onJumpToColumn が呼ばれない", async () => {
    const props = makeProps({ disabled: true });
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "jump_column_1" });
    });
    expect(props.onJumpToColumn).not.toHaveBeenCalled();
  });

  it("Ctrl+0 では onJumpToColumn が呼ばれない", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "0", ctrlKey: true }),
    );
    expect(props.onJumpToColumn).not.toHaveBeenCalled();
  });
});

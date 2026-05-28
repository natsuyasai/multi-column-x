import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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

describe("useKeyboardShortcuts", () => {
  let onComposeTweet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onComposeTweet = vi.fn();
    capturedListenCallback = null;
    mockUnlisten.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Ctrl+T を押すと onComposeTweet が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts({ onComposeTweet }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(onComposeTweet).toHaveBeenCalledOnce();
  });

  it("Ctrl+T（大文字T）を押すと onComposeTweet が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts({ onComposeTweet }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true }),
    );
    expect(onComposeTweet).toHaveBeenCalledOnce();
  });

  it("T キーだけでは onComposeTweet が呼ばれない", () => {
    renderHook(() => useKeyboardShortcuts({ onComposeTweet }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: false }),
    );
    expect(onComposeTweet).not.toHaveBeenCalled();
  });

  it("Ctrl+A では onComposeTweet が呼ばれない", () => {
    renderHook(() => useKeyboardShortcuts({ onComposeTweet }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true }),
    );
    expect(onComposeTweet).not.toHaveBeenCalled();
  });

  it("アンマウント後は Ctrl+T を押しても onComposeTweet が呼ばれない", () => {
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onComposeTweet }),
    );
    unmount();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(onComposeTweet).not.toHaveBeenCalled();
  });

  it("WebView から webview-keyboard-shortcut イベントを受信すると onComposeTweet が呼ばれる", async () => {
    renderHook(() => useKeyboardShortcuts({ onComposeTweet }));
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(onComposeTweet).toHaveBeenCalledOnce();
  });

  it("アンマウント後は webview-keyboard-shortcut イベントを受信しても onComposeTweet が呼ばれない", async () => {
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onComposeTweet }),
    );
    unmount();
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(onComposeTweet).not.toHaveBeenCalled();
  });
});

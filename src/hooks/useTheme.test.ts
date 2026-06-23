import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useTheme } from "./useTheme";

type Listener = (e: { matches: boolean }) => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    emit: (next: boolean) => {
      mql.matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("darkを渡すとdata-theme=darkを設定する", () => {
    installMatchMedia(false);
    renderHook(() => useTheme("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("lightを渡すとdata-theme=lightを設定する", () => {
    installMatchMedia(true);
    renderHook(() => useTheme("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("systemかつOSダークのときdata-theme=darkを設定する", () => {
    installMatchMedia(true);
    renderHook(() => useTheme("system"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("system選択中にOS配色が変わるとdata-themeが追従する", () => {
    const mm = installMatchMedia(true);
    renderHook(() => useTheme("system"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    mm.emit(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("systemでないときはmatchMediaを購読しない", () => {
    const mm = installMatchMedia(true);
    renderHook(() => useTheme("dark"));
    expect(mm.listenerCount()).toBe(0);
  });

  it("アンマウント時にリスナを解除する", () => {
    const mm = installMatchMedia(true);
    const { unmount } = renderHook(() => useTheme("system"));
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });
});

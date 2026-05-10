import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDialogState } from "./useDialogState";

describe("useDialogState", () => {
  it("初期状態では全ダイアログが閉じている", () => {
    const { result } = renderHook(() => useDialogState());
    expect(result.current.showAddColumn).toBe(false);
    expect(result.current.showAccountManager).toBe(false);
    expect(result.current.showAppSettings).toBe(false);
    expect(result.current.settingsColumnId).toBeNull();
    expect(result.current.showLinkPopupDialog).toBe(false);
    expect(result.current.showComposeTweetDialog).toBe(false);
    expect(result.current.tabActionColumnId).toBeNull();
  });

  it("初期状態では dialogOpen が false", () => {
    const { result } = renderHook(() => useDialogState());
    expect(result.current.dialogOpen).toBe(false);
  });

  it("showAddColumn を true にすると dialogOpen が true になる", () => {
    const { result } = renderHook(() => useDialogState());
    act(() => { result.current.setShowAddColumn(true); });
    expect(result.current.dialogOpen).toBe(true);
  });

  it("settingsColumnId をセットすると dialogOpen が true になる", () => {
    const { result } = renderHook(() => useDialogState());
    act(() => { result.current.setSettingsColumnId("col-1"); });
    expect(result.current.dialogOpen).toBe(true);
  });

  it("tabActionColumnId をセットすると dialogOpen が true になる", () => {
    const { result } = renderHook(() => useDialogState());
    act(() => { result.current.setTabActionColumnId("col-1"); });
    expect(result.current.dialogOpen).toBe(true);
  });

  it("全ダイアログを閉じると dialogOpen が false に戻る", () => {
    const { result } = renderHook(() => useDialogState());
    act(() => { result.current.setShowAccountManager(true); });
    expect(result.current.dialogOpen).toBe(true);
    act(() => { result.current.setShowAccountManager(false); });
    expect(result.current.dialogOpen).toBe(false);
  });
});

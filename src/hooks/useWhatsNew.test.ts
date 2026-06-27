import { getVersion } from "@tauri-apps/api/app";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReleaseNotes } from "../lib/githubRelease";
import { useWhatsNew } from "./useWhatsNew";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("../lib/githubRelease", () => ({ fetchReleaseNotes: vi.fn() }));

describe("useWhatsNew", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("新規インストール（lastSeen無し）: notesはnullのまま、fetchReleaseNotesは呼ばれない、lastSeenにcurrentが記録される", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0"),
    );
    expect(result.current.notes).toBeNull();
    expect(fetchReleaseNotes).not.toHaveBeenCalled();
  });

  it("更新後（lastSeen < current）でノートあり: notesにノートがセットされる、lastSeenがcurrentに更新される", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchReleaseNotes).mockResolvedValue(
      "## What's New\n- Feature A",
    );
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(result.current.notes).toBe("## What's New\n- Feature A"),
    );
    expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0");
  });

  it("更新後でノートがnull: notesはnullのまま", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchReleaseNotes).mockResolvedValue(null);
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(localStorage.getItem("mcx_lastSeenVersion")).toBe("1.0.0"),
    );
    expect(result.current.notes).toBeNull();
  });

  it("同一バージョン（lastSeen == current）: notesはnull、fetchReleaseNotesは呼ばれない", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "1.0.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(getVersion).toHaveBeenCalledOnce());
    // micro-task chain の完了を待つ
    await act(async () => {});
    expect(result.current.notes).toBeNull();
    expect(fetchReleaseNotes).not.toHaveBeenCalled();
  });

  it("ready=falseの間はgetVersionも実行されない（何もしない）", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const { result } = renderHook(
      ({ ready }: { ready: boolean }) => useWhatsNew(ready),
      { initialProps: { ready: false } },
    );
    await Promise.resolve();
    expect(getVersion).not.toHaveBeenCalled();
    expect(result.current.notes).toBeNull();
  });

  it("dismissでノートがnullになる", async () => {
    localStorage.setItem("mcx_lastSeenVersion", "0.9.0");
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchReleaseNotes).mockResolvedValue(
      "## What's New\n- Feature A",
    );
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() =>
      expect(result.current.notes).toBe("## What's New\n- Feature A"),
    );
    act(() => result.current.dismiss());
    expect(result.current.notes).toBeNull();
  });
});

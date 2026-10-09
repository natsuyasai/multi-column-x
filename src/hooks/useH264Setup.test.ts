import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_COMMANDS } from "@/constants/ipc";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_GLOBAL_SETTINGS } from "@/types";
import { shouldShowH264Prompt, useH264Setup } from "./useH264Setup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
}));

const mockInvoke = vi.mocked(invoke);
const mockRelaunch = vi.mocked(relaunch);

interface Status {
  h264Available: boolean;
  aacAvailable: boolean;
  h264DownloadApplicable: boolean;
}

/** 判定結果を返しつつ、ダウンロード用 invoke は呼び出し側が差し替えられるようにする */
function setupInvoke(
  status: Partial<Status>,
  download: () => Promise<unknown> = () => Promise.resolve(undefined),
) {
  const full: Status = {
    h264Available: false,
    aacAvailable: true,
    h264DownloadApplicable: true,
    ...status,
  };
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === IPC_COMMANDS.CHECK_MEDIA_CODEC_SUPPORT)
      return Promise.resolve(full);
    if (cmd === IPC_COMMANDS.DOWNLOAD_AND_ENABLE_H264) return download();
    return Promise.resolve(undefined);
  });
}

function downloadCalls() {
  return mockInvoke.mock.calls.filter(
    ([cmd]) => cmd === IPC_COMMANDS.DOWNLOAD_AND_ENABLE_H264,
  );
}

function checkCalls() {
  return mockInvoke.mock.calls.filter(
    ([cmd]) => cmd === IPC_COMMANDS.CHECK_MEDIA_CODEC_SUPPORT,
  );
}

function setDismissed(value: boolean) {
  useAppStore.setState({
    globalSettings: {
      ...DEFAULT_GLOBAL_SETTINGS,
      h264DownloadPromptDismissed: value,
    },
  });
}

describe("shouldShowH264Prompt", () => {
  it.each([
    {
      name: "AppImageで未取得かつ拒否していないなら表示される",
      downloadApplicable: true,
      h264Available: false,
      dismissed: false,
      expected: true,
    },
    {
      name: "AppImageで未取得でも拒否済みなら表示されない",
      downloadApplicable: true,
      h264Available: false,
      dismissed: true,
      expected: false,
    },
    {
      name: "AppImageでも取得済みなら表示されない",
      downloadApplicable: true,
      h264Available: true,
      dismissed: false,
      expected: false,
    },
    {
      name: "deb版（取得対象外）では未取得でも表示されない",
      downloadApplicable: false,
      h264Available: false,
      dismissed: false,
      expected: false,
    },
  ])("$name", ({ expected, name: _name, ...conditions }) => {
    expect(shouldShowH264Prompt(conditions)).toBe(expected);
  });
});

describe("useH264Setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRelaunch.mockResolvedValue(undefined);
    setDismissed(false);
  });

  describe("起動時の案内表示", () => {
    it("AppImageかつ未取得かつ未拒否のとき案内が表示される", async () => {
      setupInvoke({});
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
      expect(result.current.downloadApplicable).toBe(true);
      expect(result.current.h264Available).toBe(false);
      expect(result.current.downloadState).toBe("idle");
    });

    it("AppImageで未取得でも拒否済みなら案内は表示されない", async () => {
      setDismissed(true);
      setupInvoke({});
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.downloadApplicable).toBe(true));
      expect(result.current.isDialogOpen).toBe(false);
    });

    it("AppImageでも取得済みなら案内は表示されない", async () => {
      setupInvoke({ h264Available: true });
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(checkCalls()).toHaveLength(1));
      await act(async () => {});
      expect(result.current.h264Available).toBe(true);
      expect(result.current.isDialogOpen).toBe(false);
    });

    it("deb版（取得対象外）では未取得でも案内は表示されない", async () => {
      setupInvoke({ h264DownloadApplicable: false });
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(checkCalls()).toHaveLength(1));
      await act(async () => {});
      expect(result.current.downloadApplicable).toBe(false);
      expect(result.current.isDialogOpen).toBe(false);
    });

    it("Linux以外のデスクトップでは案内は表示されない", async () => {
      setupInvoke({ h264Available: true, h264DownloadApplicable: false });
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(checkCalls()).toHaveLength(1));
      await act(async () => {});
      expect(result.current.downloadApplicable).toBe(false);
      expect(result.current.isDialogOpen).toBe(false);
    });

    it("ハードウェアデコードが使える環境でもh264が未取得なら案内が表示される", async () => {
      // 判定結果にハードウェアデコード可否は含まれず、案内の表示可否に影響しない
      setupInvoke({ h264Available: false, aacAvailable: true });
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
    });

    it("カラムの復元が終わるまで案内は表示されず判定も行われない", async () => {
      setupInvoke({});
      const { result, rerender } = renderHook(
        ({ ready }) => useH264Setup(ready),
        { initialProps: { ready: false } },
      );
      await act(async () => {});
      expect(checkCalls()).toHaveLength(0);
      expect(result.current.isDialogOpen).toBe(false);

      rerender({ ready: true });
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
      expect(checkCalls()).toHaveLength(1);
    });

    it("判定は一度だけ行われ再描画しても再判定されない", async () => {
      setupInvoke({});
      const { result, rerender } = renderHook(
        ({ ready }) => useH264Setup(ready),
        { initialProps: { ready: true } },
      );
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
      rerender({ ready: true });
      rerender({ ready: false });
      rerender({ ready: true });
      await act(async () => {});
      expect(checkCalls()).toHaveLength(1);
    });

    it("判定のinvokeが失敗した場合は案内を表示しない", async () => {
      mockInvoke.mockRejectedValue(new Error("判定失敗"));
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(checkCalls()).toHaveLength(1));
      await act(async () => {});
      expect(result.current.isDialogOpen).toBe(false);
      expect(result.current.downloadApplicable).toBe(false);
    });
  });

  describe("案内の拒否", () => {
    it("今はしないを選ぶと拒否が保存され案内が閉じる", async () => {
      setupInvoke({});
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));

      act(() => result.current.dismiss());

      expect(
        useAppStore.getState().globalSettings.h264DownloadPromptDismissed,
      ).toBe(true);
      expect(result.current.isDialogOpen).toBe(false);
    });

    it("拒否が保存済みなら次回起動時（再マウント）に案内は表示されない", async () => {
      setupInvoke({});
      const first = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(first.result.current.isDialogOpen).toBe(true));
      act(() => first.result.current.dismiss());
      first.unmount();

      const second = renderHook(() => useH264Setup(true));
      await waitFor(() =>
        expect(second.result.current.downloadApplicable).toBe(true),
      );
      expect(second.result.current.isDialogOpen).toBe(false);
    });
  });

  describe("ダウンロード", () => {
    it("取得に同意するとダウンロード中の表示になる", async () => {
      let resolveDownload: () => void = () => {};
      setupInvoke(
        {},
        () =>
          new Promise<void>((resolve) => {
            resolveDownload = resolve;
          }),
      );
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));

      act(() => {
        void result.current.download();
      });

      expect(result.current.downloadState).toBe("downloading");
      expect(result.current.isDialogOpen).toBe(true);
      expect(downloadCalls()).toHaveLength(1);

      await act(async () => resolveDownload());
    });

    it("ダウンロード中は取得の操作を重ねて実行できない", async () => {
      let resolveDownload: () => void = () => {};
      setupInvoke(
        {},
        () =>
          new Promise<void>((resolve) => {
            resolveDownload = resolve;
          }),
      );
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));

      act(() => {
        void result.current.download();
        void result.current.download();
      });
      await act(async () => {
        await result.current.download();
      });

      expect(downloadCalls()).toHaveLength(1);

      await act(async () => resolveDownload());
    });

    it("ダウンロードが成功すると再起動を促す表示になりアプリは自動では再起動しない", async () => {
      setupInvoke({});
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));

      await act(async () => {
        await result.current.download();
      });

      expect(result.current.downloadState).toBe("success");
      expect(result.current.downloadError).toBeNull();
      expect(result.current.isDialogOpen).toBe(true);
      expect(mockRelaunch).not.toHaveBeenCalled();
    });

    it("今すぐ再起動を押すとアプリの再起動が要求される", async () => {
      setupInvoke({});
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
      await act(async () => {
        await result.current.download();
      });

      await act(async () => {
        await result.current.relaunchApp();
      });

      expect(mockRelaunch).toHaveBeenCalledTimes(1);
    });

    it("ダウンロードに失敗するとエラー内容が表示される", async () => {
      setupInvoke({}, () => Promise.reject(new Error("接続できません")));
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));

      await act(async () => {
        await result.current.download();
      });

      expect(result.current.downloadState).toBe("error");
      expect(result.current.downloadError).toBe("接続できません");
      expect(result.current.isDialogOpen).toBe(true);
      expect(result.current.h264Available).toBe(false);
    });

    it("Error以外で失敗した場合も文字列化したエラー内容が表示される", async () => {
      setupInvoke({}, () => Promise.reject("ネットワークエラー"));
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));

      await act(async () => {
        await result.current.download();
      });

      expect(result.current.downloadError).toBe("ネットワークエラー");
    });

    it("失敗後に再試行するとダウンロードがやり直される", async () => {
      let attempt = 0;
      let resolveSecond: () => void = () => {};
      setupInvoke({}, () => {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error("失敗"));
        return new Promise<void>((resolve) => {
          resolveSecond = resolve;
        });
      });
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
      await act(async () => {
        await result.current.download();
      });
      expect(result.current.downloadState).toBe("error");

      act(() => {
        void result.current.download();
      });

      expect(result.current.downloadState).toBe("downloading");
      expect(result.current.downloadError).toBeNull();
      expect(downloadCalls()).toHaveLength(2);

      await act(async () => resolveSecond());
      expect(result.current.downloadState).toBe("success");
    });

    it("ダウンロード失敗後に案内を閉じても拒否扱いにはならない", async () => {
      setupInvoke({}, () => Promise.reject(new Error("失敗")));
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
      await act(async () => {
        await result.current.download();
      });

      act(() => result.current.close());

      expect(result.current.isDialogOpen).toBe(false);
      expect(
        useAppStore.getState().globalSettings.h264DownloadPromptDismissed,
      ).toBe(false);
    });

    it("閉じた後は同一セッション中に案内が再表示されない", async () => {
      setupInvoke({});
      const { result, rerender } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.isDialogOpen).toBe(true));
      act(() => result.current.close());
      rerender();
      expect(result.current.isDialogOpen).toBe(false);
    });
  });

  describe("設定画面からの有効化", () => {
    it("案内を拒否した後でもアプリ設定画面からh264を有効化できる", async () => {
      setDismissed(true);
      let resolveDownload: () => void = () => {};
      setupInvoke(
        {},
        () =>
          new Promise<void>((resolve) => {
            resolveDownload = resolve;
          }),
      );
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.downloadApplicable).toBe(true));
      expect(result.current.isDialogOpen).toBe(false);

      act(() => result.current.openFromSettings());

      expect(result.current.downloadState).toBe("downloading");
      expect(downloadCalls()).toHaveLength(1);
      // 設定画面から開始した場合は案内ダイアログを開かない
      expect(result.current.isDialogOpen).toBe(false);

      await act(async () => resolveDownload());
    });

    it("設定画面からの有効化が成功すると取得済みになり再起動を促す状態が保たれる", async () => {
      setDismissed(true);
      setupInvoke({});
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.downloadApplicable).toBe(true));

      await act(async () => {
        result.current.openFromSettings();
      });

      expect(result.current.downloadState).toBe("success");
      expect(result.current.h264Available).toBe(true);
      expect(result.current.isDialogOpen).toBe(false);
      expect(mockRelaunch).not.toHaveBeenCalled();
    });

    it("設定画面からの有効化中も取得の操作は重ねて実行できない", async () => {
      setDismissed(true);
      let resolveDownload: () => void = () => {};
      setupInvoke(
        {},
        () =>
          new Promise<void>((resolve) => {
            resolveDownload = resolve;
          }),
      );
      const { result } = renderHook(() => useH264Setup(true));
      await waitFor(() => expect(result.current.downloadApplicable).toBe(true));

      act(() => {
        result.current.openFromSettings();
        result.current.openFromSettings();
      });

      expect(downloadCalls()).toHaveLength(1);

      await act(async () => resolveDownload());
    });
  });
});

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useAppLanguage } from "./useAppLanguage";

describe("useAppLanguage", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage("ja");
    document.documentElement.lang = "";
  });

  it("設定画面で言語を切り替えると即座に画面の文言が切り替わる", async () => {
    const { rerender } = renderHook(({ setting }) => useAppLanguage(setting), {
      initialProps: { setting: "ja" },
    });
    expect(i18n.language).toBe("ja");
    expect(i18n.t("common:language.auto")).toBe("自動");

    rerender({ setting: "en" });

    await vi.waitFor(() => expect(i18n.language).toBe("en"));
    expect(i18n.t("common:language.auto")).toBe("Auto");
  });

  it("言語を切り替えるとドキュメントの言語属性も追従する", () => {
    const { rerender } = renderHook(({ setting }) => useAppLanguage(setting), {
      initialProps: { setting: "ja" },
    });
    expect(document.documentElement.lang).toBe("ja");

    rerender({ setting: "en" });

    expect(document.documentElement.lang).toBe("en");
  });

  it("リストアされた言語設定が en のとき表示言語が英語になる", async () => {
    const { result } = renderHook(() => useAppLanguage("en"));

    expect(result.current).toBe("en");
    await vi.waitFor(() => expect(i18n.language).toBe("en"));
  });

  it("言語設定が自動のときOSの言語から表示言語が決まる", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    const { result } = renderHook(() => useAppLanguage("auto"));

    expect(result.current).toBe("en");
    await vi.waitFor(() => expect(i18n.language).toBe("en"));
    expect(document.documentElement.lang).toBe("en");
  });

  it("言語設定が自動でOSの言語が日本語のとき日本語になる", async () => {
    await i18n.changeLanguage("en");
    vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
    const { result } = renderHook(() => useAppLanguage("auto"));

    expect(result.current).toBe("ja");
    await vi.waitFor(() => expect(i18n.language).toBe("ja"));
  });

  it("未対応の言語設定は自動として扱われる", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("ja");
    const { result } = renderHook(() => useAppLanguage("fr"));

    expect(result.current).toBe("ja");
  });
});

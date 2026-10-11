/// <reference types="vitest/globals" />
import { beforeEach, vi } from "vitest";
import "@testing-library/jest-dom";
import i18n from "@/i18n";

// 既存テストは日本語文言を前提にしているため、全テストを日本語に固定する
// （jsdom の navigator.language は "en-US" のため、言語設定 "auto" も日本語に解決させる）
beforeEach(async () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
  await i18n.changeLanguage("ja");
});

// Tauri APIをモック
Object.defineProperty(window, "__TAURI__", {
  value: {
    invoke: vi.fn(),
    event: {
      listen: vi.fn(),
      emit: vi.fn(),
    },
  },
  writable: true,
});

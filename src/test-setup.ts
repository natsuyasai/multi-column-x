/// <reference types="vitest/globals" />
import { beforeEach, vi } from "vitest";
import "@testing-library/jest-dom";
import i18n from "@/i18n";

// 既存テストは日本語文言を前提にしているため、全テストを日本語に固定する
beforeEach(async () => {
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

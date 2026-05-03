/// <reference types="vitest/globals" />
import { vi } from "vitest";
import "@testing-library/jest-dom";

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

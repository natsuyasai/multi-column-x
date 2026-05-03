import { describe, it, expect } from "vitest";
import { resolveColumnUrl } from "./index";

describe("resolveColumnUrl", () => {
  it("homeページのURLを返す", () => {
    expect(resolveColumnUrl({ pageType: "home" })).toBe("https://x.com/home");
  });

  it("notificationsページのURLを返す", () => {
    expect(resolveColumnUrl({ pageType: "notifications" })).toBe(
      "https://x.com/notifications",
    );
  });

  it("searchページのURLをクエリ付きで返す", () => {
    expect(resolveColumnUrl({ pageType: "search", searchQuery: "tauri" })).toBe(
      "https://x.com/search?q=tauri",
    );
  });

  it("listページのURLをリストID付きで返す", () => {
    expect(resolveColumnUrl({ pageType: "list", listId: "12345" })).toBe(
      "https://x.com/i/lists/12345",
    );
  });

  it("customページのURLをそのまま返す", () => {
    expect(
      resolveColumnUrl({
        pageType: "custom",
        customUrl: "https://x.com/explore",
      }),
    ).toBe("https://x.com/explore");
  });
});

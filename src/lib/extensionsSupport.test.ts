import { describe, expect, it } from "vitest";
import {
  isExtensionsSupported,
  resolveExtensionPageAccountId,
} from "@/lib/extensionsSupport";

describe("isExtensionsSupported", () => {
  it("Windowsでは設定画面に拡張機能の管理が表示される", () => {
    expect(isExtensionsSupported("windows", false)).toBe(true);
  });

  it("Windows以外とモバイルでは拡張機能の管理が表示されない", () => {
    expect(isExtensionsSupported("linux", false)).toBe(false);
    expect(isExtensionsSupported("macos", false)).toBe(false);
    expect(isExtensionsSupported("android", true)).toBe(false);
    expect(isExtensionsSupported("windows", true)).toBe(false);
  });
});

describe("resolveExtensionPageAccountId", () => {
  it("ポップアップを開くときは現在選択中のアカウントのデータで開かれる", () => {
    expect(resolveExtensionPageAccountId("acc-2", ["acc-1", "acc-2"])).toBe(
      "acc-2",
    );
  });

  it("選択中のアカウントが無ければ先頭カラムのアカウントを使う", () => {
    expect(resolveExtensionPageAccountId(null, ["acc-1", "acc-2"])).toBe(
      "acc-1",
    );
  });

  it("選択中のアカウントも先頭カラムも無ければ null を返す", () => {
    expect(resolveExtensionPageAccountId(null, [])).toBeNull();
  });

  it("選択中のアカウントIDが空文字のときは未選択として先頭カラムのアカウントを使う", () => {
    expect(resolveExtensionPageAccountId("", ["acc-1"])).toBe("acc-1");
    expect(resolveExtensionPageAccountId("", [])).toBeNull();
  });
});

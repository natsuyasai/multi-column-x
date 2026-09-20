import { describe, expect, it } from "vitest";
import type { PageType } from "@/types";
import { isAutoReloadSupported } from "./autoReloadTarget";

describe("isAutoReloadSupported", () => {
  const cases: ReadonlyArray<[PageType, boolean]> = [
    ["home", true],
    ["search", true],
    ["notifications", true],
    ["custom", true],
    ["compose", true],
    ["list", false],
    ["external", false],
  ];

  it.each(cases)("pageTypeが%sの場合は%sを返す", (pageType, expected) => {
    expect(isAutoReloadSupported({ pageType })).toBe(expected);
  });

  it("ホームのリストタブのカラムでは自動更新が従来どおり動く", () => {
    const column: { pageType: PageType; homeTabName: string } = {
      pageType: "home",
      homeTabName: "main",
    };
    expect(isAutoReloadSupported(column)).toBe(true);
  });

  it("リスト詳細カラムでは自動更新の対象外になる", () => {
    expect(isAutoReloadSupported({ pageType: "list" })).toBe(false);
  });
});

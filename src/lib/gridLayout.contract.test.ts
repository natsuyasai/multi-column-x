// SCSS 側の寸法と gridLayout.ts の rem 定数のドリフト検出。
// ネイティブ WebView の bounds（JS）と React の見た目（CSS）は同じ rem 値でなければならない。
import { describe, expect, it } from "vitest";
import {
  HEADER_HEIGHT_REM,
  MOBILE_TAB_BAR_HEIGHT_REM,
  SCROLLBAR_HEIGHT_REM,
  TOPBAR_COLLAPSED_HEIGHT_REM,
  TOPBAR_EXPANDED_HEIGHT_REM,
} from "./gridLayout";

// @types/node を入れていないため、型なしの動的 import で fs を読み込む（Vitest は Node 上で動く）
const nodeFs = "node:fs";
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (path: string, encoding: "utf-8") => string;
};
const readScss = (relativeToSrc: string) =>
  readFileSync(`src/${relativeToSrc}`, "utf-8");

const appScss = readScss("App.module.scss");
const columnHeaderScss = readScss(
  "components/ColumnHeader/ColumnHeader.module.scss",
);
const mobileTabBarScss = readScss(
  "components/MobileTabBar/MobileTabBar.module.scss",
);
const topBarScss = readScss("components/TopBar/TopBar.module.scss");

/** セレクタ直後のブロックから height の rem 値を取り出す */
function heightRemOf(source: string, selector: string): number {
  const start = source.indexOf(selector);
  expect(start, `${selector} が見つからない`).toBeGreaterThanOrEqual(0);
  const block = source.slice(start, source.indexOf("}", start));
  const match = /(?:^|[\s;{])height:\s*([\d.]+)rem/.exec(block);
  expect(match, `${selector} に rem の height が無い`).not.toBeNull();
  return Number(match![1]);
}

describe("gridLayout の rem 定数とSCSSの寸法の契約", () => {
  it("TopBarの折りたたみ時の高さが$topbar-row-heightと一致する", () => {
    const m = /\$topbar-row-height:\s*([\d.]+)rem/.exec(topBarScss);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(TOPBAR_COLLAPSED_HEIGHT_REM);
  });

  it("TopBarの展開時の高さが2行分の$topbar-row-heightと一致する", () => {
    const m = /\$topbar-row-height:\s*([\d.]+)rem/.exec(topBarScss);
    expect(Number(m![1]) * 2).toBe(TOPBAR_EXPANDED_HEIGHT_REM);
  });

  it("ColumnHeaderの高さがHEADER_HEIGHT_REMと一致する", () => {
    const src = columnHeaderScss;
    expect(heightRemOf(src, ".header {")).toBe(HEADER_HEIGHT_REM);
  });

  it("MobileTabBarの高さがMOBILE_TAB_BAR_HEIGHT_REMと一致する", () => {
    const src = mobileTabBarScss;
    expect(heightRemOf(src, ".tabBar {")).toBe(MOBILE_TAB_BAR_HEIGHT_REM);
  });

  it("下部スクロールバーの高さがSCROLLBAR_HEIGHT_REMと一致する", () => {
    const src = appScss;
    expect(heightRemOf(src, ".bottomScrollbar {")).toBe(SCROLLBAR_HEIGHT_REM);
    expect(heightRemOf(src, "&::-webkit-scrollbar {")).toBe(
      SCROLLBAR_HEIGHT_REM,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  listModuleScssFiles,
  parseScss,
  readScss,
} from "@/test-utils/scssBlocks";
import type { ScssBlock } from "@/test-utils/scssBlocks";
import {
  ANDROID_TAP_EXEMPT,
  GRID_EXEMPT,
  checkAndroidMixins,
  checkAndroidTapTarget,
  checkBorderColor,
  checkDuration,
  checkFontSize,
  checkGrid,
  checkInteractiveStates,
  checkModuleScss,
  checkOutlineRemoval,
  checkReducedMotion,
  checkTokenGrid,
  formatViolation,
  type Violation,
} from "@/test-utils/uiDesignRules";

const moduleFiles = listModuleScssFiles();

const blocksOf = (file: string): ScssBlock[] => parseScss(readScss(file), file);

const expectNoViolations = (violations: Violation[]) =>
  expect(violations.map(formatViolation)).toEqual([]);

describe("UIデザインの契約（共通基盤）", () => {
  it("共通トークンのスペーシングと角丸は0.25remの倍数である", () => {
    expectNoViolations(checkTokenGrid(readScss("src/styles/_tokens.scss")));
  });

  it("index.css が動きの軽減設定でtransitionとanimationを無効化している", () => {
    expectNoViolations(checkReducedMotion(readScss("src/index.css")));
  });

  it("Android用ミキシンは data-platform=android 配下にだけ宣言を持つ", () => {
    expectNoViolations(checkAndroidMixins(readScss("src/styles/_mixins.scss")));
  });
});

const perFileRules: [
  name: string,
  check: (blocks: ScssBlock[]) => Violation[],
][] = [
  ["寸法は0.25remの倍数でpxは1px以下だけである", (b) => checkGrid(b)],
  ["文字サイズは最小0.75remである", checkFontSize],
  ["動きの長さは150〜250msに収まる", checkDuration],
  [
    "押せる要素にhover・active・focus-visibleが定義されている",
    checkInteractiveStates,
  ],
  ["アウトラインを消していない", checkOutlineRemoval],
  ["入力欄と枠付きボタンの枠色が装飾用の色ではない", checkBorderColor],
  [
    "Androidの当たり判定が44px以上になる指定がある",
    (b) => checkAndroidTapTarget(b),
  ],
];

describe("UIデザインの契約（全モジュールSCSS）", () => {
  it("モジュールSCSSの列挙が主要なファイルを取りこぼしていない", () => {
    expect(moduleFiles).toEqual(
      expect.arrayContaining([
        "src/components/ConfirmDialog/ConfirmDialog.module.scss",
        "src/components/TopBar/TopBar.module.scss",
        "src/components/MobileTabBar/MobileTabBar.module.scss",
        "src/components/AppSettingsPanel/AppSettingsPanel.module.scss",
      ]),
    );
  });

  it.each(perFileRules)("%s", (_name, check) => {
    expectNoViolations(moduleFiles.flatMap((file) => check(blocksOf(file))));
  });

  it("全モジュールSCSSが例外ファイルの指定なしで全ルールを満たす", () => {
    expectNoViolations(
      moduleFiles.flatMap((file) => checkModuleScss(blocksOf(file))),
    );
  });
});

describe("UIデザインの契約（例外定数の陳腐化検知）", () => {
  it("GRID_EXEMPT の各エントリは実在するファイル・セレクタ・宣言に一致し、実際に例外が必要である", () => {
    const stale = GRID_EXEMPT.filter(
      (entry) =>
        !moduleFiles.includes(entry.file) ||
        !checkGrid(blocksOf(entry.file), []).some(
          (v) =>
            v.selector === entry.selector &&
            v.detail.startsWith(`${entry.prop}:`),
        ),
    ).map((entry) => `${entry.file} ${entry.selector} ${entry.prop}`);
    expect(stale, "実在しない、または例外が不要なエントリ").toEqual([]);
  });

  it("ANDROID_TAP_EXEMPT の各エントリは実在するファイル・セレクタに一致し、実際に例外が必要である", () => {
    const stale = ANDROID_TAP_EXEMPT.filter(
      (entry) =>
        !moduleFiles.includes(entry.file) ||
        !checkAndroidTapTarget(blocksOf(entry.file), []).some(
          (v) => v.selector === entry.selector,
        ),
    ).map((entry) => `${entry.file} ${entry.selector}`);
    expect(stale, "実在しない、または例外が不要なエントリ").toEqual([]);
  });

  it("例外定数のエントリはすべて理由を持つ", () => {
    const withoutReason = [...GRID_EXEMPT, ...ANDROID_TAP_EXEMPT].filter(
      (entry) => entry.reason.trim() === "",
    );
    expect(withoutReason).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { parseScss } from "./scssBlocks";
import {
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
  isFormBlock,
} from "./uiDesignRules";

const blocksOf = (scss: string) => parseScss(scss, "fixture.module.scss");
const details = (violations: { detail: string }[]) =>
  violations.map((v) => v.detail);

describe("checkTokenGrid（トークンは0.25remの倍数）", () => {
  it("0.25remの倍数だけなら違反なし", () => {
    const source = `$space-1: 0.25rem; // 4px
$space-2: 0.5rem;
$radius-lg: 0.75rem;
$font-size-sm: 0.8125rem;`;

    expect(checkTokenGrid(source)).toEqual([]);
  });

  it("倍数でないspaceトークンを違反にする", () => {
    const violations = checkTokenGrid("$space-1: 0.3rem;");

    expect(details(violations)).toEqual(["$space-1: 0.3rem"]);
  });

  it("rem以外の単位のradiusトークンを違反にする", () => {
    const violations = checkTokenGrid("$radius-sm: 4px;");

    expect(details(violations)).toEqual(["$radius-sm: 4px"]);
  });
});

describe("checkGrid（寸法は0.25remの倍数）", () => {
  it("0.25remの倍数・負値・0・複数値なら違反なし", () => {
    const blocks = blocksOf(
      ".a { padding: 0.5rem 1rem; margin: -0.25rem; gap: 0.75rem; top: 0; }",
    );

    expect(checkGrid(blocks)).toEqual([]);
  });

  it("0.25remの倍数でないremを宣言ごとに違反にする", () => {
    const blocks = blocksOf(
      ".a { padding: 0.375rem 0.5rem; border-radius: 0.3rem; margin: 1rem; }",
    );

    expect(details(checkGrid(blocks))).toEqual([
      "padding: 0.375rem 0.5rem",
      "border-radius: 0.3rem",
    ]);
  });

  it("1pxを超えるpxを違反にし、1px以下は許可する", () => {
    const blocks = blocksOf(".a { width: 10px; height: 1px; top: 0.5px; }");

    expect(details(checkGrid(blocks))).toEqual(["width: 10px"]);
  });

  it("em単位の寸法を違反にする", () => {
    const blocks = blocksOf(".a { padding: 1em; margin: 0; }");

    expect(details(checkGrid(blocks))).toEqual(["padding: 1em"]);
  });

  it("env() と var() の中身、%、vh、vw は対象外にする", () => {
    const blocks = blocksOf(`.a {
      padding-top: calc(0.5rem + env(safe-area-inset-top, 0px));
      width: 100%;
      height: calc(100vh - 2rem);
      max-width: min(90vw, 37.5rem);
      left: var(--x, 3px);
    }`);

    expect(checkGrid(blocks)).toEqual([]);
  });

  it("寸法以外のプロパティと、SCSS変数・@includeの引数は対象外にする", () => {
    const blocks = blocksOf(`.a {
      border-width: 0.3rem;
      line-height: 1.3rem;
      padding: t.$space-2;
      @include m.android-tap-target(2.3rem);
    }`);

    expect(checkGrid(blocks)).toEqual([]);
  });

  it("Android用の入れ子ブロックの寸法も検査する", () => {
    const blocks = blocksOf(
      '.a { :global([data-platform="android"]) & { min-height: 2.7rem; } }',
    );

    expect(details(checkGrid(blocks))).toEqual(["min-height: 2.7rem"]);
  });

  it("除外リストに載った宣言は理由付きで許可する", () => {
    const blocks = blocksOf(".bar { height: 2.3rem; width: 2.3rem; }");
    const exempt = [
      {
        file: "fixture.module.scss",
        selector: ".bar",
        prop: "height",
        reason: "ネイティブ連動の固定バー高さ",
      },
    ];

    expect(details(checkGrid(blocks, exempt))).toEqual(["width: 2.3rem"]);
  });
});

describe("checkFontSize（最小0.75rem）", () => {
  it("0.75rem以上のrem・emと、それ以外の指定は違反なし", () => {
    const blocks = blocksOf(
      ".a { font-size: 0.75rem; } .b { font-size: 1.125em; } .c { font-size: inherit; } .d { font-size: t.$font-size-sm; }",
    );

    expect(checkFontSize(blocks)).toEqual([]);
  });

  it("0.75rem未満のremを違反にする", () => {
    const blocks = blocksOf(".a { font-size: 0.7rem; }");

    expect(details(checkFontSize(blocks))).toEqual(["font-size: 0.7rem"]);
  });

  it("0.75em未満のemと12px未満のpxを違反にする", () => {
    const blocks = blocksOf(".a { font-size: 0.5em; } .b { font-size: 11px; }");

    expect(details(checkFontSize(blocks))).toEqual([
      "font-size: 0.5em",
      "font-size: 11px",
    ]);
  });
});

describe("checkDuration（動きは150〜250ms）", () => {
  it("150〜250msの範囲（s・ms換算、複数宣言）は違反なし", () => {
    const blocks = blocksOf(`.a {
      transition: color 0.15s ease, background-color 200ms ease-in 0s;
      transition-duration: 0.25s;
      animation: fade 0.2s ease;
    }`);

    expect(checkDuration(blocks)).toEqual([]);
  });

  it("範囲外のtransitionを違反にする", () => {
    const blocks = blocksOf(
      ".a { transition: opacity 0.1s; } .b { transition: color 0.2s, width 0.5s; }",
    );

    expect(details(checkDuration(blocks))).toEqual([
      "transition: opacity 0.1s",
      "transition: color 0.2s, width 0.5s",
    ]);
  });

  it("transition-duration と animation-duration と animation の範囲外を違反にする", () => {
    const blocks = blocksOf(`.a { transition-duration: 300ms; }
.b { animation-duration: 1s; }
.c { animation: slide 0.4s ease; }`);

    expect(details(checkDuration(blocks))).toEqual([
      "transition-duration: 300ms",
      "animation-duration: 1s",
      "animation: slide 0.4s ease",
    ]);
  });

  it("遅延は検査せず、cubic-bezier のカンマで分割しない", () => {
    const blocks = blocksOf(
      ".a { transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1) 1s; }",
    );

    expect(checkDuration(blocks)).toEqual([]);
  });

  it("infinite を含む animation・0・none・inherit・変数は対象外にする", () => {
    const blocks = blocksOf(`.a { animation: spin 1s linear infinite; }
.b { transition: none; }
.c { transition: color 0s; }
.d { animation: inherit; }
.e { transition: color t.$duration-base; }
.f { transition-duration: var(--d); }`);

    expect(checkDuration(blocks)).toEqual([]);
  });
});

describe("checkReducedMotion（動きの軽減）", () => {
  it("transition-duration と animation-duration を上書きしていれば違反なし", () => {
    const css = `* { margin: 0; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}`;

    expect(checkReducedMotion(css)).toEqual([]);
  });

  it("メディアクエリが無ければ違反にする", () => {
    const violations = checkReducedMotion("* { margin: 0; }");

    expect(details(violations)).toEqual([
      "@media (prefers-reduced-motion: reduce) is missing",
    ]);
  });

  it("transition-duration の上書きが欠けていれば違反にする", () => {
    const css = `@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}`;

    expect(details(checkReducedMotion(css))).toEqual([
      "transition-duration  override is missing",
    ]);
  });

  it("animation-duration の上書きが別のメディアクエリにしか無ければ違反にする", () => {
    const css = `@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; }
}
@media (min-width: 600px) {
  * { animation-duration: 0.01ms !important; }
}`;

    expect(details(checkReducedMotion(css))).toEqual([
      "animation-duration  override is missing",
    ]);
  });
});

describe("checkInteractiveStates（押下要素の状態）", () => {
  it("hover・active・focus-visible が揃っていれば違反なし（focus-ring のincludeだけの定義も可）", () => {
    const blocks = blocksOf(`.btn {
      cursor: pointer;
      &:hover { background: red; }
      &:active { background: blue; }
      &:focus-visible { @include m.focus-ring; }
    }`);

    expect(checkInteractiveStates(blocks)).toEqual([]);
  });

  it("欠けている状態を列挙して違反にする", () => {
    const blocks = blocksOf(`.btn {
      cursor: pointer;
      &:hover { background: red; }
    }`);

    expect(details(checkInteractiveStates(blocks))).toEqual([
      ":active",
      ":focus-visible",
    ]);
  });

  it("入れ子の子孫セレクタも末尾の要素名で対応付ける", () => {
    const blocks = blocksOf(`.panel {
      .btn {
        cursor: pointer;
        &:hover { color: red; }
        &:active { color: red; }
        &:focus-visible { @include m.focus-ring; }
      }
    }`);

    expect(checkInteractiveStates(blocks)).toEqual([]);
  });

  it("別のクラスの状態定義は対応付けない", () => {
    const blocks = blocksOf(`.a { cursor: pointer; }
.b { &:hover { color: red; } &:active { color: red; } &:focus-visible { @include m.focus-ring; } }`);

    expect(details(checkInteractiveStates(blocks))).toEqual([
      ":hover",
      ":active",
      ":focus-visible",
    ]);
  });

  it("cursor: pointer を持たないブロックとAndroid用ブロックは対象外にする", () => {
    const blocks = blocksOf(`.label { color: red; }
.btn {
  cursor: pointer;
  &:hover { color: red; }
  &:active { color: red; }
  &:focus-visible { @include m.focus-ring; }
  :global([data-platform="android"]) & { cursor: pointer; }
}`);

    expect(checkInteractiveStates(blocks)).toEqual([]);
  });
});

describe("checkInteractiveStates（入力欄の focus-visible）", () => {
  it("入力欄に :focus-visible（focus-ring のincludeだけでも可）があれば違反なし", () => {
    const blocks = blocksOf(`.input {
      color: red;
      &:focus-visible { @include m.focus-ring; }
    }
.field select { color: red; }
.field select:focus-visible { border-color: blue; }`);

    expect(checkInteractiveStates(blocks)).toEqual([]);
  });

  it(":focus-visible の無い入力欄を違反にする", () => {
    const blocks = blocksOf(".input { color: red; }");

    expect(checkInteractiveStates(blocks)).toEqual([
      {
        rule: "interactive-states",
        file: "fixture.module.scss",
        selector: ".input",
        detail: ":focus-visible",
      },
    ]);
  });

  it(":focus だけ（outline を消して枠色を変える）の入力欄は違反にする", () => {
    const blocks = blocksOf(`.input {
      color: red;
      &:focus { outline: none; border-color: blue; }
    }`);

    expect(details(checkInteractiveStates(blocks))).toEqual([":focus-visible"]);
  });

  it(":hover や ::placeholder などの擬似付きサブブロックは入力欄のベースとして数えない", () => {
    const blocks = blocksOf(`.input {
      color: red;
      &:focus-visible { @include m.focus-ring; }
      &:hover { border-color: blue; }
      &::placeholder { color: gray; }
      &:disabled { opacity: 0.5; }
    }`);

    expect(checkInteractiveStates(blocks)).toEqual([]);
  });

  it("別のクラスの :focus-visible は入力欄に対応付けない", () => {
    const blocks = blocksOf(`.input { color: red; }
.btn { &:focus-visible { @include m.focus-ring; } }`);

    expect(checkInteractiveStates(blocks).map((v) => v.selector)).toEqual([
      ".input",
    ]);
  });

  it("入力欄かつ cursor: pointer のブロックは状態の違反を重複して数えない", () => {
    const blocks = blocksOf(".input { cursor: pointer; }");

    expect(details(checkInteractiveStates(blocks))).toEqual([
      ":hover",
      ":active",
      ":focus-visible",
    ]);
  });
});

describe("checkOutlineRemoval（アウトライン消去の禁止）", () => {
  it("outline を消していなければ違反なし", () => {
    const blocks = blocksOf(
      ".a { outline: 2px solid red; } .b { outline-offset: 2px; }",
    );

    expect(checkOutlineRemoval(blocks)).toEqual([]);
  });

  it("outline: none と outline: 0 を違反にする", () => {
    const blocks = blocksOf(
      ".a { outline: none; } .b:focus { outline: 0; } .c { outline: 0px; }",
    );

    expect(details(checkOutlineRemoval(blocks))).toEqual([
      "outline: none",
      "outline: 0",
      "outline: 0px",
    ]);
  });

  it(":focus-visible のセレクタ内でのみ outline を消すことを許可する", () => {
    const blocks = blocksOf(".a { &:focus-visible { outline: none; } }");

    expect(checkOutlineRemoval(blocks)).toEqual([]);
  });
});

describe("checkBorderColor（フォーム部品・押下要素の枠色）", () => {
  it("border-strong・accent・danger の枠なら違反なし", () => {
    const blocks =
      blocksOf(`.input { border: 1px solid var(--mcx-border-strong); }
.select { border-color: var(--mcx-accent); }
.btn { cursor: pointer; border: 1px solid var(--mcx-danger); }`);

    expect(checkBorderColor(blocks)).toEqual([]);
  });

  it("入力欄・セレクト・テキストエリアの枠が border / border-subtle なら違反にする", () => {
    const blocks = blocksOf(`.input { border: 1px solid var(--mcx-border); }
.field select { border-color: var(--mcx-border-subtle); }
textarea { border: 1px solid var(--mcx-border, #333); }`);

    expect(details(checkBorderColor(blocks))).toEqual([
      "border: 1px solid var(--mcx-border)",
      "border-color: var(--mcx-border-subtle)",
      "border: 1px solid var(--mcx-border, #333)",
    ]);
  });

  it("枠線付きの押下要素の枠が border なら違反にする", () => {
    const blocks = blocksOf(
      ".btn { cursor: pointer; border: 1px solid var(--mcx-border); }",
    );

    expect(details(checkBorderColor(blocks))).toEqual([
      "border: 1px solid var(--mcx-border)",
    ]);
  });

  it("枠なしの押下要素と、押下要素でも入力欄でもないカードは対象外にする", () => {
    const blocks = blocksOf(`.btn { cursor: pointer; border: none; }
.card { border: 1px solid var(--mcx-border); }`);

    expect(checkBorderColor(blocks)).toEqual([]);
  });
});

describe("checkAndroidTapTarget（Androidの当たり判定44px以上）", () => {
  it("android-tap-target のinclude、またはAndroid用ブロックの min-height 2.75rem 以上なら違反なし", () => {
    const blocks =
      blocksOf(`.a { cursor: pointer; @include m.android-tap-target; }
.b { cursor: pointer; @include m.android-tap-target(3rem); }
.c { cursor: pointer; :global([data-platform="android"]) & { min-height: 2.75rem; } }
.input { @include m.android-tap-target; }`);

    expect(checkAndroidTapTarget(blocks)).toEqual([]);
  });

  it("cursor: pointer のブロックで当たり判定の指定が無ければ違反にする", () => {
    const blocks = blocksOf(".btn { cursor: pointer; }");

    expect(details(checkAndroidTapTarget(blocks))).toEqual([
      "Android tap target (min 2.75rem) is missing",
    ]);
  });

  it("input・select・textarea のブロックも当たり判定の指定を要求する", () => {
    const blocks = blocksOf(
      ".input { color: red; } .field select { color: red; }",
    );

    expect(checkAndroidTapTarget(blocks).map((v) => v.selector)).toEqual([
      ".input",
      ".field select",
    ]);
  });

  it("2.75rem未満のmin-heightや引数は不足として違反にする", () => {
    const blocks =
      blocksOf(`.a { cursor: pointer; :global([data-platform="android"]) & { min-height: 2rem; } }
.b { cursor: pointer; @include m.android-tap-target(2rem); }`);

    expect(checkAndroidTapTarget(blocks).map((v) => v.selector)).toEqual([
      ".a",
      ".b",
    ]);
  });

  it("状態用のブロックとAndroid用ブロック自身は対象外にする", () => {
    const blocks = blocksOf(`.btn {
      cursor: pointer;
      @include m.android-tap-target;
      &:hover { cursor: pointer; }
    }`);

    expect(checkAndroidTapTarget(blocks)).toEqual([]);
  });

  it("除外リストに載ったセレクタは理由付きで許可する", () => {
    const blocks = blocksOf(".tab { cursor: pointer; }");
    const exempt = [
      {
        file: "fixture.module.scss",
        selector: ".tab",
        reason: "desktop 専用の固定高さバー",
      },
    ];

    expect(checkAndroidTapTarget(blocks, exempt)).toEqual([]);
  });
});

describe("checkAndroidTapTarget（チェックボックス・ラジオの扱い）", () => {
  it("input[type=checkbox] と input[type=radio] は当たり判定の指定を要求しない", () => {
    const blocks = blocksOf(`.checkLabel {
      cursor: pointer;
      @include m.android-tap-target;
      input[type="checkbox"] { accent-color: red; }
      input[type=radio] { accent-color: red; }
    }`);

    expect(checkAndroidTapTarget(blocks)).toEqual([]);
  });

  it("親の label が当たり判定を持たなければ違反にする（input の免除では隠れない）", () => {
    const blocks = blocksOf(`.checkLabel {
      cursor: pointer;
      input[type="checkbox"] { accent-color: red; }
    }`);

    expect(checkAndroidTapTarget(blocks).map((v) => v.selector)).toEqual([
      ".checkLabel",
    ]);
  });

  it("input[type=text] などチェックボックス・ラジオ以外の入力欄は引き続き要求する", () => {
    const blocks = blocksOf(`.field input[type="text"] { color: red; }
.field input[type="number"] { color: red; }`);

    expect(checkAndroidTapTarget(blocks).map((v) => v.selector)).toEqual([
      '.field input[type="text"]',
      '.field input[type="number"]',
    ]);
  });
});

describe("checkAndroidMixins（Android用ミキシンの限定）", () => {
  const valid = `@use "tokens" as t;
@mixin android-tap-target($min: t.$tap-target-min) {
  :global([data-platform="android"]) & {
    min-height: $min;
    min-width: $min;
  }
}
@mixin android-button-gap($gap: t.$space-2) {
  :global([data-platform="android"]) & {
    gap: $gap;
  }
}`;

  it('宣言がすべて [data-platform="android"] 配下なら違反なし', () => {
    expect(checkAndroidMixins(valid)).toEqual([]);
  });

  it("ミキシン直下（Androidの外）に宣言があれば違反にする", () => {
    const source = valid.replace(
      "@mixin android-button-gap($gap: t.$space-2) {",
      "@mixin android-button-gap($gap: t.$space-2) {\n  gap: $gap;",
    );

    expect(details(checkAndroidMixins(source))).toEqual([
      "android-button-gap: declaration outside Android: gap",
    ]);
  });

  it("mixin is missing、またはAndroid配下に宣言が無ければ違反にする", () => {
    const source = `@mixin android-tap-target { :global([data-platform="android"]) & { } }`;

    expect(details(checkAndroidMixins(source))).toEqual([
      "android-tap-target: no declarations under Android",
      "android-button-gap: mixin is missing",
    ]);
  });
});

describe("checkModuleScss（モジュールSCSSの項目2〜9を一括検査）", () => {
  it("違反の無いSCSSは空配列を返す", () => {
    const blocks = blocksOf(`.btn {
      padding: 0.5rem;
      font-size: 0.875rem;
      cursor: pointer;
      border: 1px solid var(--mcx-border-strong);
      transition: color 0.15s;
      @include m.android-tap-target;
      &:hover { color: red; }
      &:active { color: red; }
      &:focus-visible { @include m.focus-ring; }
    }`);

    expect(checkModuleScss(blocks)).toEqual([]);
  });

  it("複数ルールの違反をルール名付きでまとめて返す", () => {
    const blocks = blocksOf(
      ".btn { padding: 0.3rem; font-size: 0.5rem; transition: color 1s; outline: none; }",
    );

    expect(checkModuleScss(blocks).map((v) => v.rule)).toEqual([
      "grid",
      "font-size",
      "duration",
      "outline-removal",
    ]);
  });
});

describe("isFormBlock（入力欄の判定）", () => {
  const isForm = (scss: string) => isFormBlock(blocksOf(scss)[0]);

  it("input・select・textarea の要素セレクタは入力欄として扱う", () => {
    expect(isForm("input { color: red; }")).toBe(true);
    expect(isForm('input[type="checkbox"] { color: red; }')).toBe(true);
    expect(isForm(".row input:focus { color: red; }")).toBe(true);
    expect(isForm(".field select { color: red; }")).toBe(true);
    expect(isForm("textarea { color: red; }")).toBe(true);
  });

  it("末尾クラスが input・select・textarea そのもの、または camelCase の接尾辞なら入力欄として扱う", () => {
    for (const name of [
      "select",
      "input",
      "textInput",
      "numberInput",
      "selectInput",
      "unitSelect",
      "nameInput",
      "cssTextarea",
      "editInput",
    ]) {
      expect(isForm(`.${name} { color: red; }`), name).toBe(true);
    }
  });

  it("状態・ラッパー・複数形のクラスは入力欄として扱わない", () => {
    for (const name of [
      "cellSelected",
      "fixedInputGroup",
      "selectedRow",
      "inputRow",
      "inputs",
    ]) {
      expect(isForm(`.${name} { color: red; }`), name).toBe(false);
    }
  });

  it("祖先に入力欄らしいクラスがあっても末尾が違えば入力欄として扱わない", () => {
    expect(isForm(".inputRow .label { color: red; }")).toBe(false);
  });

  it("枠色とAndroidタップの両方の検査で同じ判定を使う", () => {
    const blocks =
      blocksOf(`.cellSelected { border: 1px solid var(--mcx-border); color: red; }
.unitSelect { border: 1px solid var(--mcx-border); }`);

    expect(checkBorderColor(blocks).map((v) => v.selector)).toEqual([
      ".unitSelect",
    ]);
    expect(checkAndroidTapTarget(blocks).map((v) => v.selector)).toEqual([
      ".unitSelect",
    ]);
  });
});

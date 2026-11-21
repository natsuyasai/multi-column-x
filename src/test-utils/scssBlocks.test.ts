import { describe, expect, it } from "vitest";
import {
  listModuleScssFiles,
  parseScss,
  readScss,
  stripScssComments,
} from "./scssBlocks";

describe("parseScss", () => {
  it("単一ブロックの宣言を抽出する", () => {
    const blocks = parseScss(".btn { color: red; padding: 1rem; }", "a.scss");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].selector).toBe(".btn");
    expect(blocks[0].declarations).toEqual([
      { prop: "color", value: "red" },
      { prop: "padding", value: "1rem" },
    ]);
    expect(blocks[0].file).toBe("a.scss");
  });

  it("&:hover と &.active を親セレクタで展開する", () => {
    const blocks = parseScss(
      `.btn {
        color: red;
        &:hover { color: blue; }
        &.active { color: green; }
      }`,
    );

    expect(blocks.map((b) => b.selector)).toEqual([
      ".btn",
      ".btn:hover",
      ".btn.active",
    ]);
    expect(blocks[0].declarations).toEqual([{ prop: "color", value: "red" }]);
    expect(blocks[1].declarations).toEqual([{ prop: "color", value: "blue" }]);
    expect(blocks[2].declarations).toEqual([{ prop: "color", value: "green" }]);
  });

  it("ネストした子孫セレクタを親と空白で結合する", () => {
    const blocks = parseScss(
      `.btn {
        .child { margin: 0; }
        .inner { &:hover { margin: 1rem; } }
      }`,
    );

    expect(blocks.map((b) => b.selector)).toEqual([
      ".btn",
      ".btn .child",
      ".btn .inner",
      ".btn .inner:hover",
    ]);
  });
});

describe("parseScss のコメント処理", () => {
  it("コメント内の波括弧や宣言風の文字列を無視し url(//x) の値は保持する", () => {
    const blocks = parseScss(`
      // .ghost { color: red; }
      .a {
        /* .hidden { top: 0; } */
        background: url(//example.com/a.png); // 末尾
      }
    `);

    expect(blocks.map((b) => b.selector)).toEqual([".a"]);
    expect(blocks[0].declarations).toEqual([
      { prop: "background", value: "url(//example.com/a.png)" },
    ]);
  });
});

describe("parseScss の値の正規化", () => {
  it("複数行の transition 値を1行に空白で正規化する", () => {
    const blocks = parseScss(`.a {
      transition:
        color 0.2s,
        background-color 0.2s;
    }`);

    expect(blocks[0].declarations).toEqual([
      { prop: "transition", value: "color 0.2s, background-color 0.2s" },
    ]);
  });
});

describe("parseScss の @include と変数", () => {
  it("ブロック直下の @include を引数込みで収集し宣言には含めない", () => {
    const blocks = parseScss(`.btn {
      @include m.focus-ring;
      @include m.android-tap-target(2.75rem);
      color: red;
      &:hover { @include m.transition-base(color, background-color); }
    }`);

    expect(blocks[0].includes).toEqual([
      "m.focus-ring",
      "m.android-tap-target(2.75rem)",
    ]);
    expect(blocks[0].declarations).toEqual([{ prop: "color", value: "red" }]);
    expect(blocks[1].selector).toBe(".btn:hover");
    expect(blocks[1].includes).toEqual([
      "m.transition-base(color, background-color)",
    ]);
  });
});

describe("parseScss の変数と @use", () => {
  it("$var 宣言と @use は宣言として扱わない", () => {
    const blocks = parseScss(`@use "../../styles/tokens" as t;
$row-height: 2rem;
.a {
  $local: 1rem;
  height: $row-height;
  padding: $local;
}`);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].selector).toBe(".a");
    expect(blocks[0].declarations).toEqual([
      { prop: "height", value: "$row-height" },
      { prop: "padding", value: "$local" },
    ]);
  });
});

describe("parseScss の Android 判定", () => {
  it(':global([data-platform="android"]) & を isAndroid=true にする', () => {
    const blocks = parseScss(`.btn {
      color: red;
      :global([data-platform="android"]) & {
        min-height: 2.75rem;
      }
    }`);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].isAndroid).toBe(false);
    expect(blocks[1].selector).toBe(':global([data-platform="android"]) .btn');
    expect(blocks[1].isAndroid).toBe(true);
    expect(blocks[1].declarations).toEqual([
      { prop: "min-height", value: "2.75rem" },
    ]);
  });
});

describe("parseScss の @media", () => {
  it("@media ブロック内の宣言を親セレクタ付きで取得する", () => {
    const blocks = parseScss(`.btn {
      color: red;
      @media (max-width: 40rem) {
        padding: 0.5rem;
        &:hover { color: blue; }
      }
    }`);

    expect(blocks.map((b) => b.selector)).toEqual([
      ".btn",
      ".btn",
      ".btn:hover",
    ]);
    expect(blocks[1].declarations).toEqual([
      { prop: "padding", value: "0.5rem" },
    ]);
    expect(blocks[2].declarations).toEqual([{ prop: "color", value: "blue" }]);
  });

  it("トップレベルの @media 内のセレクタもそのまま取得できる", () => {
    const blocks = parseScss(`@media (prefers-reduced-motion: reduce) {
      .a { transition-duration: 0.01ms; }
    }`);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].selector).toBe(".a");
  });
});

describe("parseScss の @mixin", () => {
  it("@mixin 定義を selector が @mixin 名のブロックとして扱う", () => {
    const blocks = parseScss(`@mixin android-tap-target($min: 2.75rem) {
      :global([data-platform="android"]) & {
        min-height: $min;
      }
    }
    @mixin focus-ring {
      outline: 0.125rem solid var(--mcx-accent);
    }`);

    expect(blocks.map((b) => b.selector)).toEqual([
      "@mixin android-tap-target",
      ':global([data-platform="android"]) @mixin android-tap-target',
      "@mixin focus-ring",
    ]);
    expect(blocks[1].isAndroid).toBe(true);
    expect(blocks[1].declarations).toEqual([
      { prop: "min-height", value: "$min" },
    ]);
    expect(blocks[2].declarations).toEqual([
      { prop: "outline", value: "0.125rem solid var(--mcx-accent)" },
    ]);
  });
});

describe("parseScss の @keyframes", () => {
  it("@keyframes 内のブロックの selector を @keyframes 名にする", () => {
    const blocks = parseScss(`@keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }`);

    expect(blocks.map((b) => b.selector)).toEqual([
      "@keyframes spin",
      "@keyframes spin",
      "@keyframes spin",
    ]);
    expect(blocks.flatMap((b) => b.declarations)).toEqual([
      { prop: "transform", value: "rotate(0deg)" },
      { prop: "transform", value: "rotate(360deg)" },
    ]);
  });
});

describe("parseScss の @if と セレクタリスト", () => {
  it("@if と @else は親セレクタを引き継ぐ", () => {
    const blocks = parseScss(`@mixin gap($g) {
      @if $g > 0 {
        gap: $g;
      } @else {
        gap: 0;
      }
    }`);

    expect(blocks.map((b) => b.selector)).toEqual([
      "@mixin gap",
      "@mixin gap",
      "@mixin gap",
    ]);
    expect(blocks.flatMap((b) => b.declarations)).toEqual([
      { prop: "gap", value: "$g" },
      { prop: "gap", value: "0" },
    ]);
  });

  it("セレクタリストはカンマ込み・改行を空白に正規化して保持する", () => {
    const blocks = parseScss(`.a,
.b {
  color: red;
}`);

    expect(blocks[0].selector).toBe(".a, .b");
  });
});

describe("stripScssComments", () => {
  it("行コメントとブロックコメントを除去する", () => {
    const source = `// 行コメント
.a { color: red; /* ブロック
コメント */ margin: 0; // 末尾コメント
}`;

    const stripped = stripScssComments(source);

    expect(stripped).not.toContain("行コメント");
    expect(stripped).not.toContain("ブロック");
    expect(stripped).not.toContain("末尾コメント");
    expect(stripped).toContain("color: red;");
    expect(stripped).toContain("margin: 0;");
  });

  it("url(//x) や文字列内の // は壊さない", () => {
    const source = `.a { background: url(//example.com/a.png); content: "//keep"; // 消える
}`;

    const stripped = stripScssComments(source);

    expect(stripped).toContain("url(//example.com/a.png)");
    expect(stripped).toContain('"//keep"');
    expect(stripped).not.toContain("消える");
  });
});

describe("listModuleScssFiles", () => {
  it("src 配下の module.scss を昇順で列挙し ConfirmDialog を含む", () => {
    const files = listModuleScssFiles();

    expect(files).toContain(
      "src/components/ConfirmDialog/ConfirmDialog.module.scss",
    );
    expect(files.every((f) => f.endsWith(".module.scss"))).toBe(true);
    expect(files.every((f) => f.startsWith("src/"))).toBe(true);
    expect(files).toEqual([...files].sort());
  });
});

describe("readScss と実ファイルのパース", () => {
  it("ConfirmDialog.module.scss の .dialog の width が min(22.5rem, 100%) と取れる", () => {
    const path = "src/components/ConfirmDialog/ConfirmDialog.module.scss";

    const blocks = parseScss(readScss(path), path);
    const dialog = blocks.find((b) => b.selector === ".dialog");

    expect(dialog).toBeDefined();
    expect(dialog!.file).toBe(path);
    expect(dialog!.declarations).toContainEqual({
      prop: "width",
      value: "min(22.5rem, 100%)",
    });
  });
});

describe("parseScss の補間", () => {
  it("#{...} 補間の波括弧をブロックと誤認しない", () => {
    const blocks = parseScss(`@mixin panel($padding) {
      padding-top: calc(#{$padding} + env(safe-area-inset-top, 0px));
      margin: 0 calc(-1 * #{$padding});
    }`);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].declarations).toEqual([
      {
        prop: "padding-top",
        value: "calc(#{$padding} + env(safe-area-inset-top, 0px))",
      },
      { prop: "margin", value: "0 calc(-1 * #{$padding})" },
    ]);
  });
});

describe("parseScss のその他の at-rule 文", () => {
  it("@include 以外の @ 始まりの文（@extend など）は宣言に含めない", () => {
    const blocks = parseScss(`.a {
      @extend %base;
      color: red;
    }`);

    expect(blocks[0].declarations).toEqual([{ prop: "color", value: "red" }]);
    expect(blocks[0].includes).toEqual([]);
  });
});

describe("全 module.scss のパース", () => {
  it("すべての module.scss をパースでき、prop が空の宣言や未解決の & が残らない", () => {
    for (const path of listModuleScssFiles()) {
      const blocks = parseScss(readScss(path), path);

      expect(blocks.length, `${path} にブロックが無い`).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block.selector, `${path}`).not.toBe("");
        expect(block.selector, `${path}`).not.toContain("&");
        for (const declaration of block.declarations) {
          expect(declaration.prop, `${path} ${block.selector}`).toMatch(
            /^-{0,2}[a-z][\w-]*$/,
          );
        }
      }
    }
  });
});

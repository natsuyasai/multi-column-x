import { parseScss, type ScssBlock } from "./scssBlocks";

export interface Violation {
  rule: string;
  file: string;
  selector: string;
  detail: string;
}

export interface GridExemption {
  file: string;
  selector: string;
  prop: string;
  reason: string;
}

export interface AndroidTapExemption {
  file: string;
  selector: string;
  reason: string;
}

export const GRID_EXEMPT: GridExemption[] = [
  {
    file: "src/components/TopBar/TopBar.module.scss",
    selector: ".row2",
    prop: "padding",
    reason:
      "Rounding the 0.125rem vertical padding to 0.25rem would grow the expanded TopBar from 62px to 66px, past the 4rem (64px) native WebView bounds, so it would overlap the columns",
  },
];
const DESKTOP_ONLY_BAR =
  "Desktop-only control inside a fixed-height bar; never rendered on Android";

export const ANDROID_TAP_EXEMPT: AndroidTapExemption[] = [
  {
    file: "src/components/ColumnHeader/ColumnHeader.module.scss",
    selector: ".actionBtn",
    reason: DESKTOP_ONLY_BAR,
  },
  {
    file: "src/components/ColumnHeader/ColumnHeader.module.scss",
    selector: ".unreadBadge",
    reason: DESKTOP_ONLY_BAR,
  },
  {
    file: "src/components/TopBar/TopBar.module.scss",
    selector: ".btn",
    reason: DESKTOP_ONLY_BAR,
  },
];

const QUARTER_REM = 0.25;

/** 浮動小数の誤差を許容して 0.25 の倍数かを判定する */
export function isMultipleOfQuarter(value: number): boolean {
  const ratio = value / QUARTER_REM;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

/** _tokens.scss の $space-* / $radius-* が 0.25rem の倍数であること */
export function checkTokenGrid(source: string): Violation[] {
  const violations: Violation[] = [];
  for (const m of source.matchAll(
    /^\$((?:space|radius)-[\w-]+)\s*:\s*([^;]+);/gm,
  )) {
    const value = m[2].trim();
    const rem = /^(-?[\d.]+)rem$/.exec(value);
    if (rem && isMultipleOfQuarter(Number(rem[1]))) continue;
    violations.push({
      rule: "token-grid",
      file: "_tokens.scss",
      selector: `$${m[1]}`,
      detail: `$${m[1]}: ${value}`,
    });
  }
  return violations;
}

/** 値から、検査対象外の部分（補間・SCSS 変数・env() / var()）を取り除く */
function stripNonLiteral(value: string): string {
  let result = value
    .replace(/#\{[^}]*\}/g, " ")
    .replace(/[\w-]*\.?\$[\w-]+/g, " ");
  let previous: string;
  do {
    previous = result;
    result = result.replace(/\b(?:env|var)\([^()]*\)/g, " ");
  } while (result !== previous);
  return result;
}

interface Dimension {
  amount: number;
  unit: "rem" | "em" | "px";
}

function extractDimensions(value: string): Dimension[] {
  return Array.from(
    stripNonLiteral(value).matchAll(/(-?\d*\.?\d+)(rem|em|px)\b/g),
    (m) => ({ amount: Number(m[1]), unit: m[2] as Dimension["unit"] }),
  );
}

const DIMENSION_PROP =
  /^(?:(?:padding|margin)(?:-[a-z]+)*|gap|row-gap|column-gap|(?:min-|max-)?(?:width|height)|border(?:-[a-z]+)*-radius|top|right|bottom|left)$/;

function isOffGrid({ amount, unit }: Dimension): boolean {
  if (amount === 0) return false;
  if (unit === "px") return Math.abs(amount) > 1;
  if (unit === "em") return true;
  return !isMultipleOfQuarter(amount);
}

/** 寸法宣言の rem 値が 0.25rem の倍数であること（px は 1px 以下のみ、em は不可） */
export function checkGrid(
  blocks: ScssBlock[],
  exempt: GridExemption[] = GRID_EXEMPT,
): Violation[] {
  const violations: Violation[] = [];
  for (const block of blocks) {
    for (const { prop, value } of block.declarations) {
      if (!DIMENSION_PROP.test(prop)) continue;
      if (!extractDimensions(value).some(isOffGrid)) continue;
      const isExempt = exempt.some(
        (e) =>
          e.file === block.file &&
          e.selector === block.selector &&
          e.prop === prop,
      );
      if (isExempt) continue;
      violations.push({
        rule: "grid",
        file: block.file,
        selector: block.selector,
        detail: `${prop}: ${value}`,
      });
    }
  }
  return violations;
}
const MIN_FONT_SIZE_REM = 0.75;

/** font-size の rem / em 値は 0.75rem 以上（px は 12px 以上） */
export function checkFontSize(blocks: ScssBlock[]): Violation[] {
  const violations: Violation[] = [];
  for (const block of blocks) {
    for (const { prop, value } of block.declarations) {
      if (prop !== "font-size") continue;
      const tooSmall = extractDimensions(value).some(
        ({ amount, unit }) =>
          (unit === "px" ? amount / 16 : amount) < MIN_FONT_SIZE_REM,
      );
      if (!tooSmall) continue;
      violations.push({
        rule: "font-size",
        file: block.file,
        selector: block.selector,
        detail: `${prop}: ${value}`,
      });
    }
  }
  return violations;
}
const MIN_DURATION_MS = 150;
const MAX_DURATION_MS = 250;
const DURATION_PROPS = new Set([
  "transition",
  "transition-duration",
  "animation",
  "animation-duration",
]);

/** 括弧の外側にあるカンマで分割する（cubic-bezier(...) 内のカンマでは分割しない） */
function splitTopLevel(value: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth--;
    else if (value[i] === "," && depth === 0) {
      items.push(value.slice(start, i));
      start = i + 1;
    }
  }
  items.push(value.slice(start));
  return items.map((item) => item.trim());
}

/** 項目内で最初に現れる時間（= duration。2つ目以降は delay）をミリ秒で返す。無ければ null */
function firstDurationMs(item: string): number | null {
  const cleaned = stripNonLiteral(item).replace(/\([^()]*\)/g, " ");
  const m = /(?:^|[\s,])(-?\d*\.?\d+)(ms|s)(?![\w-])/.exec(cleaned);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "s" ? 1000 : 1);
}

/** transition / animation の時間は 150〜250ms（infinite の animation と 0 は除外） */
export function checkDuration(blocks: ScssBlock[]): Violation[] {
  const violations: Violation[] = [];
  for (const block of blocks) {
    for (const { prop, value } of block.declarations) {
      if (!DURATION_PROPS.has(prop)) continue;
      if (/\binfinite\b/.test(value)) continue;
      const outOfRange = splitTopLevel(value)
        .map(firstDurationMs)
        .some(
          (ms) =>
            ms !== null &&
            ms !== 0 &&
            (ms < MIN_DURATION_MS || ms > MAX_DURATION_MS),
        );
      if (!outOfRange) continue;
      violations.push({
        rule: "duration",
        file: block.file,
        selector: block.selector,
        detail: `${prop}: ${value}`,
      });
    }
  }
  return violations;
}
/** index.css に prefers-reduced-motion: reduce があり、transition / animation の duration を上書きしていること */
export function checkReducedMotion(css: string): Violation[] {
  const header =
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/.exec(css);
  const violation = (detail: string): Violation => ({
    rule: "reduced-motion",
    file: "src/index.css",
    selector: "@media (prefers-reduced-motion: reduce)",
    detail,
  });
  if (!header) {
    return [violation("@media (prefers-reduced-motion: reduce) is missing")];
  }
  let depth = 1;
  let end = header.index + header[0].length;
  while (end < css.length && depth > 0) {
    if (css[end] === "{") depth++;
    else if (css[end] === "}") depth--;
    end++;
  }
  const body = css.slice(header.index + header[0].length, end);
  return ["transition-duration", "animation-duration"]
    .filter((prop) => !new RegExp(`${prop}\\s*:`).test(body))
    .map((prop) => violation(`${prop}  override is missing`));
}
/** カンマ区切りのセレクタを個別のセレクタに分ける */
function selectorParts(selector: string): string[] {
  return splitTopLevel(selector).filter((part) => part !== "");
}

/** セレクタ末尾の複合セレクタ（結合子で区切られた最後の要素）を返す */
function lastCompound(part: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < part.length; i++) {
    const ch = part[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) start = i + 1;
  }
  return part.slice(start);
}

/** 複合セレクタから擬似クラスを除いたもの（`.btn:hover` → `.btn`） */
function compoundKey(compound: string): string {
  return compound.replace(/::?[\w-]+(?:\([^)]*\))?/g, "");
}

function hasPointerCursor(block: ScssBlock): boolean {
  return block.declarations.some(
    (d) => d.prop === "cursor" && d.value === "pointer",
  );
}

function isCheckable(block: ScssBlock): boolean {
  return !block.isAndroid && !block.selector.startsWith("@");
}

const REQUIRED_STATES = [":hover", ":active", ":focus-visible"];
const INPUT_REQUIRED_STATES = [":focus-visible"];

/** 擬似クラス・擬似要素を持たない複合セレクタか（属性セレクタ内の `:` は無視する） */
function hasNoPseudo(compound: string): boolean {
  return !compound.replace(/\[[^\]]*\]/g, "").includes(":");
}

/** 同一ファイル内に、compound と同じ要素の指定した状態（:hover など）の定義があるか */
function hasStateDefinition(
  blocks: ScssBlock[],
  compound: string,
  state: string,
): boolean {
  const key = compoundKey(compound);
  return blocks.some((other) =>
    selectorParts(other.selector).some((candidate) => {
      const candidateCompound = lastCompound(candidate);
      return (
        candidateCompound.includes(state) &&
        compoundKey(candidateCompound) === key
      );
    }),
  );
}

/**
 * 押せる要素（cursor: pointer）には :hover / :active / :focus-visible、
 * 入力欄（input / select / textarea 系のベースのブロック）には :focus-visible が、
 * 同一ファイル内に定義されていること。入力欄の :focus だけの定義は不足として扱う
 */
export function checkInteractiveStates(blocks: ScssBlock[]): Violation[] {
  const violations: Violation[] = [];
  for (const block of blocks) {
    if (!isCheckable(block)) continue;
    const pointer = hasPointerCursor(block);
    const parts = selectorParts(block.selector);
    const requiredStates = (compound: string): string[] => {
      if (pointer) return REQUIRED_STATES;
      if (isFormCompound(compound) && hasNoPseudo(compound)) {
        return INPUT_REQUIRED_STATES;
      }
      return [];
    };
    const missingStates = new Set<string>();
    for (const part of parts) {
      const compound = lastCompound(part);
      if (/:(?:hover|active|focus)/.test(compound)) continue;
      for (const state of requiredStates(compound)) {
        if (!hasStateDefinition(blocks, compound, state)) {
          missingStates.add(state);
        }
      }
    }
    for (const state of [...REQUIRED_STATES].filter((st) =>
      missingStates.has(st),
    )) {
      violations.push({
        rule: "interactive-states",
        file: block.file,
        selector: block.selector,
        detail: state,
      });
    }
  }
  return violations;
}
/** outline: none / 0 を持つブロックは、:focus-visible のセレクタ以外では禁止 */
export function checkOutlineRemoval(blocks: ScssBlock[]): Violation[] {
  const violations: Violation[] = [];
  for (const block of blocks) {
    if (block.selector.startsWith("@")) continue;
    if (block.selector.includes(":focus-visible")) continue;
    for (const { prop, value } of block.declarations) {
      if (prop === "outline" && /^(?:none|0(?:px)?)$/.test(value)) {
        violations.push({
          rule: "outline-removal",
          file: block.file,
          selector: block.selector,
          detail: `${prop}: ${value}`,
        });
      }
    }
  }
  return violations;
}
/** 複合セレクタが input / select / textarea 系か（要素セレクタ、または末尾クラス名が該当） */
function isFormCompound(compound: string): boolean {
  const plain = compound
    .replace(/::?[\w-]+(?:\([^)]*\))?/g, "")
    .replace(/\[[^\]]*\]/g, "");
  if (/^(?:input|select|textarea)(?![\w-])/.test(plain)) return true;
  const lastClass = Array.from(plain.matchAll(/\.([\w-]+)/g)).pop()?.[1];
  if (lastClass === undefined) return false;
  return (
    /^(?:input|select|textarea)$/.test(lastClass) ||
    /(?:Input|Select|Textarea)$/.test(lastClass)
  );
}

/** 末尾の複合セレクタが input / select / textarea 系のブロックか（枠色・Androidタップの検査で共有） */
export function isFormBlock(block: ScssBlock): boolean {
  return selectorParts(block.selector).some((part) =>
    isFormCompound(lastCompound(part)),
  );
}

const DECORATIVE_BORDER = /var\(\s*--mcx-border(?:-subtle)?\s*[,)]/;

/** 入力欄と、枠線付きの押下要素の枠色は --mcx-border / --mcx-border-subtle（装飾用）を使わない */
export function checkBorderColor(blocks: ScssBlock[]): Violation[] {
  const violations: Violation[] = [];
  for (const block of blocks) {
    if (!isCheckable(block)) continue;
    const border = block.declarations.find((d) => d.prop === "border");
    const hasVisibleBorder =
      border !== undefined && !/^(?:none|0)\b/.test(border.value);
    const isBorderedButton = hasPointerCursor(block) && hasVisibleBorder;
    if (!isFormBlock(block) && !isBorderedButton) continue;
    for (const { prop, value } of block.declarations) {
      if (prop !== "border" && prop !== "border-color") continue;
      if (!DECORATIVE_BORDER.test(value)) continue;
      violations.push({
        rule: "border-color",
        file: block.file,
        selector: block.selector,
        detail: `${prop}: ${value}`,
      });
    }
  }
  return violations;
}
const MIN_TAP_TARGET_REM = 2.75;

/** input[type=checkbox] / input[type=radio]（当たり判定は親の label 側で担保する設計） */
function isCheckableCompound(compound: string): boolean {
  return /\[\s*type\s*=\s*["']?(?:checkbox|radio)["']?\s*\]/.test(compound);
}

/** Android タップ検査の対象になる入力欄ブロックか（チェックボックス・ラジオは親の label を検査する） */
function isTapTargetFormBlock(block: ScssBlock): boolean {
  return selectorParts(block.selector).some((part) => {
    const compound = lastCompound(part);
    return isFormCompound(compound) && !isCheckableCompound(compound);
  });
}

/** 当たり判定の寸法（rem 数値、または tap-target トークン）が 2.75rem 以上か */
function isLargeEnough(value: string): boolean {
  if (/\$tap-target-(?:min|comfortable)\b/.test(value)) return true;
  const rem = /^(\d*\.?\d+)rem$/.exec(value.trim());
  return rem !== null && Number(rem[1]) >= MIN_TAP_TARGET_REM;
}

/** android-tap-target の include か（引数があれば 2.75rem 以上であること） */
function isTapTargetInclude(include: string): boolean {
  const m = /android-tap-target(?:\((.*)\))?$/.exec(include.trim());
  if (!m) return false;
  return m[1] === undefined || m[1].trim() === "" || isLargeEnough(m[1]);
}

function isStateCompound(compound: string): boolean {
  return /:(?:hover|active|focus|focus-visible|disabled)\b/.test(compound);
}

/**
 * cursor: pointer のブロックと input / select / textarea 系ブロックは、
 * android-tap-target の include か Android 用ブロックの min-height 2.75rem 以上を持つこと
 */
export function checkAndroidTapTarget(
  blocks: ScssBlock[],
  exempt: AndroidTapExemption[] = ANDROID_TAP_EXEMPT,
): Violation[] {
  const violations: Violation[] = [];
  for (const block of blocks) {
    if (!isCheckable(block)) continue;
    if (!hasPointerCursor(block) && !isTapTargetFormBlock(block)) continue;
    const parts = selectorParts(block.selector);
    if (parts.every((part) => isStateCompound(lastCompound(part)))) continue;
    if (
      exempt.some((e) => e.file === block.file && e.selector === block.selector)
    ) {
      continue;
    }
    const keys = parts.map((part) => compoundKey(lastCompound(part)));
    const related = blocks.filter((other) =>
      selectorParts(other.selector).some((part) =>
        keys.includes(compoundKey(lastCompound(part))),
      ),
    );
    const satisfied = related.some(
      (other) =>
        other.includes.some(isTapTargetInclude) ||
        (other.isAndroid &&
          other.declarations.some(
            (d) => d.prop === "min-height" && isLargeEnough(d.value),
          )),
    );
    if (satisfied) continue;
    violations.push({
      rule: "android-tap-target",
      file: block.file,
      selector: block.selector,
      detail: "Android tap target (min 2.75rem) is missing",
    });
  }
  return violations;
}
const ANDROID_MIXINS = ["android-tap-target", "android-button-gap"];

/** _mixins.scss の Android 用ミキシンは、宣言を [data-platform="android"] 配下にのみ持つこと */
export function checkAndroidMixins(mixinsSource: string): Violation[] {
  const blocks = parseScss(mixinsSource, "src/styles/_mixins.scss");
  const violations: Violation[] = [];
  for (const name of ANDROID_MIXINS) {
    const violation = (detail: string): Violation => ({
      rule: "android-mixin",
      file: "src/styles/_mixins.scss",
      selector: `@mixin ${name}`,
      detail: `${name}: ${detail}`,
    });
    const own = blocks.filter((b) => b.selector.includes(`@mixin ${name}`));
    if (own.length === 0) {
      violations.push(violation("mixin is missing"));
      continue;
    }
    for (const block of own) {
      if (block.isAndroid) continue;
      for (const { prop } of block.declarations) {
        violations.push(violation(`declaration outside Android: ${prop}`));
      }
    }
    const hasAndroidDeclaration = own.some(
      (b) => b.isAndroid && b.declarations.length > 0,
    );
    if (!hasAndroidDeclaration) {
      violations.push(violation("no declarations under Android"));
    }
  }
  return violations;
}

/** モジュール SCSS 1 ファイル分のブロックに、項目 2〜9 のルールをすべて適用する */
export function checkModuleScss(blocks: ScssBlock[]): Violation[] {
  return [
    ...checkGrid(blocks),
    ...checkFontSize(blocks),
    ...checkDuration(blocks),
    ...checkInteractiveStates(blocks),
    ...checkOutlineRemoval(blocks),
    ...checkBorderColor(blocks),
    ...checkAndroidTapTarget(blocks),
  ];
}

/** 違反を「file selector — detail」の1行にして失敗メッセージを読みやすくする */
export function formatViolation(v: Violation): string {
  return `[${v.rule}] ${v.file} ${v.selector} — ${v.detail}`;
}

import indexCss from "../index.css?raw";

// Storybook は src/index.css を読み込まないため、--mcx-* のテーマ変数が未定義になる。
// （例: フォーカスリングの `var(--mcx-accent)` が無効値になり outline が出ない。）
// index.css の色トークンのブロック（`:root` / `:root[data-theme=...]`）だけを抜き出して
// <style> として差し込み、data-theme に応じたテーマ変数を Story でも有効にする。
// html, body の overflow など他のグローバル指定は持ち込まない。

const STYLE_ID = "story-theme-tokens";

function extractTokenBlocks(css: string): string {
  return (css.match(/:root[^{]*\{[^}]*\}/g) ?? [])
    .filter((block) => block.includes("--mcx-"))
    .join("\n");
}

/** テーマ変数を <html> に有効にする。何度呼んでも差し込むのは 1 回だけ */
export function installThemeTokens(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = extractTokenBlocks(indexCss);
  document.head.appendChild(style);
}

/**
 * index.css 先頭の `*` リセット（box-sizing: border-box / margin・padding: 0）を一時的に有効にし、
 * 元に戻す関数を返す。固定高さのバー（TopBar / ColumnHeader / MobileTabBar）は border-box 前提の
 * 高さなので、高さに収まるかを実測する play 内で使う。他の Story に残さないよう try / finally で戻すこと。
 */
export function installAppReset(): () => void {
  const reset = /\*,\s*\*::before,\s*\*::after\s*\{[^}]*\}/.exec(indexCss);
  const style = document.createElement("style");
  style.textContent = reset?.[0] ?? "";
  document.head.appendChild(style);
  return () => style.remove();
}

import { expect } from "storybook/test";

// Story の play function 用のヘルパ。Android の当たり判定（44px）と隣接ボタン間隔を実測で検証する。
// 44px = 2.75rem（html の font-size が 16px のとき）。

const TAP_TARGET_SELECTOR =
  'button, input, select, textarea, a, [role="button"], [role="tab"], label';

export type Platform = "android" | "desktop";

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

const CHECKABLE_SELECTOR = 'input[type="checkbox"], input[type="radio"]';

// チェックボックス / ラジオの input は対象外（親の label を検査する）。
// 逆にチェックボックス / ラジオを含まない label はテキスト欄の見出しであり、
// 押す対象ではないので対象外にする
function isExcluded(element: Element): boolean {
  if (element.matches(CHECKABLE_SELECTOR)) return true;
  return (
    element.tagName === "LABEL" && !element.querySelector(CHECKABLE_SELECTOR)
  );
}

function describe(element: Element): string {
  const label = (element.textContent ?? "").trim().slice(0, 20);
  return `<${element.tagName.toLowerCase()}>${label}`;
}

/** root 内の可視な操作要素の幅・高さがすべて minPx 以上であること */
export async function expectTapTargets(
  root: HTMLElement,
  minPx: number,
): Promise<void> {
  const targets = Array.from(root.querySelectorAll(TAP_TARGET_SELECTOR)).filter(
    (el) => isVisible(el) && !isExcluded(el),
  );
  await expect(targets.length).toBeGreaterThan(0);
  const tooSmall = targets
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width < minPx - 0.5 || rect.height < minPx - 0.5)
    .map(
      ({ el, rect }) =>
        `${describe(el)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
    );
  await expect(tooSmall).toEqual([]);
}

/** 同じ親を持つ隣接ボタンどうしの間隔（縦または横）がすべて minPx 以上であること */
export async function expectAdjacentGap(
  root: HTMLElement,
  minPx: number,
): Promise<void> {
  const buttons = Array.from(
    root.querySelectorAll<HTMLElement>("button"),
  ).filter(isVisible);
  const narrow: string[] = [];
  for (let i = 0; i < buttons.length - 1; i++) {
    const a = buttons[i];
    const b = buttons[i + 1];
    if (a.parentElement !== b.parentElement) continue;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const gapX = Math.max(rb.left - ra.right, ra.left - rb.right);
    const gapY = Math.max(rb.top - ra.bottom, ra.top - rb.bottom);
    const gap = Math.max(gapX, gapY);
    if (gap < minPx - 0.5) {
      narrow.push(`${describe(a)} - ${describe(b)}: ${Math.round(gap)}px`);
    }
  }
  await expect(narrow).toEqual([]);
}

/**
 * <html> の data-platform を設定し、元に戻す関数を返す。
 * play 内で try / finally により必ず戻すこと（Story をまたいで残さない）。
 */
export function setPlatform(platform: Platform): () => void {
  const el = document.documentElement;
  const previous = el.getAttribute("data-platform");
  el.setAttribute("data-platform", platform);
  return () => {
    if (previous === null) el.removeAttribute("data-platform");
    else el.setAttribute("data-platform", previous);
  };
}

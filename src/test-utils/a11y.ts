const CONTROL_SELECTOR = [
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=button]",
  "[role=tab]",
].join(", ");

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const role = element.getAttribute("role");
  return `<${tag}${id}${role ? ` role="${role}"` : ""}>`;
}

function hasAccessibleName(element: Element): boolean {
  try {
    // 引数なしの toHaveAccessibleName は「空でない名前を持つ」ことを検証する
    expect(element).toHaveAccessibleName();
    return true;
  } catch {
    return false;
  }
}

/**
 * container 内の操作要素（button / input / select / textarea / role=button / role=tab）が
 * すべて空でないアクセシブルネームを持つことを検証する。違反した要素は列挙して失敗させる。
 */
export function expectAccessibleControls(container: HTMLElement): void {
  const violations = Array.from(
    container.querySelectorAll(CONTROL_SELECTOR),
  ).filter((element) => !hasAccessibleName(element));

  expect(
    violations.map(describeElement),
    "controls without an accessible name",
  ).toEqual([]);
}

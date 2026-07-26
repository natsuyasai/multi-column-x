// header_customizer.ts は IIFE のため import 時に実行され、
// window.__multiColumnXConfig の hideHeaderEnabled/hideTweetInputEnabled に応じて
// HeaderCustomizer を初回マウントするかどうかを決める。
// 公開 API の window.__multiColumnX.applyAreaVisibility は設定変更時の再適用に使われ、
// 「常に unmount してから、必要なら mount し直す」ことで useHeaderCustomizer.ts の
// useEffect(() => {...}, []) を再実行させ、最新の設定値を読み直させる。
// テストは「import した／applyAreaVisibility を呼んだ結果の副作用」として検証する
// （mobile_area_hide.test.ts / compose_only.test.ts と同様のパターン）。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";

const CONTAINER_ID = "multi-column-x-header-customizer-root";

function setConfig(config: Partial<MultiColumnXConfig>): void {
  window.__multiColumnXConfig = config as MultiColumnXConfig;
}

function getContainer(): HTMLElement | null {
  return document.getElementById(CONTAINER_ID);
}

async function importHeaderCustomizer(): Promise<void> {
  vi.resetModules();
  await act(async () => {
    await import("./header_customizer");
  });
}

describe("inject/header_customizer のapplyAreaVisibility", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__multiColumnXConfig;
  });

  afterEach(() => {
    act(() => {
      window.__multiColumnX?.applyAreaVisibility?.(false, false);
    });
  });

  it("applyAreaVisibilityを呼ぶと、既にマウント済みでも一度アンマウントしてから再マウントする", async () => {
    setConfig({ hideHeaderEnabled: true, hideTweetInputEnabled: true });

    await importHeaderCustomizer();
    const firstContainer = getContainer();
    expect(firstContainer).not.toBeNull();

    // 設定値は変わらないが、既にマウント済みの状態での呼び出しをシミュレートする
    act(() => {
      window.__multiColumnX.applyAreaVisibility(true, true);
    });

    const secondContainer = getContainer();
    expect(secondContainer).not.toBeNull();
    // 同じ id のコンテナだが、unmount→mount により別要素インスタンスに置き換わっている
    expect(secondContainer).not.toBe(firstContainer);
  });

  it("hideHeaderEnabledとhideTweetInputEnabledが両方falseになったときアンマウントする", async () => {
    setConfig({ hideHeaderEnabled: true, hideTweetInputEnabled: true });

    await importHeaderCustomizer();
    expect(getContainer()).not.toBeNull();

    act(() => {
      window.__multiColumnX.applyAreaVisibility(false, false);
    });

    expect(getContainer()).toBeNull();
  });

  it("両方trueから片方だけfalseになっても再マウントされる（コンテナが作り直される）", async () => {
    setConfig({ hideHeaderEnabled: true, hideTweetInputEnabled: true });

    await importHeaderCustomizer();
    const firstContainer = getContainer();
    expect(firstContainer).not.toBeNull();

    act(() => {
      window.__multiColumnX.applyAreaVisibility(true, false);
    });

    const secondContainer = getContainer();
    expect(secondContainer).not.toBeNull();
    expect(secondContainer).not.toBe(firstContainer);
  });
});

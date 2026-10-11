// context_menu.ts は IIFE のため、import 時に contextmenu リスナーが document へ登録される。
// 画面文言は共有ハブ window.__mcxI18n 経由で設定される。
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
// 画面文言の共有ハブ（window.__mcxI18n）を読み込む（日本語固定の既定言語で従来の文言を検証する）
import "./i18n";

/** かな・カタカナ・漢字を1文字でも含むか（英語表示の検証用） */
function containsJapanese(text: string): boolean {
  return /[぀-ヿ一-鿿]/.test(text);
}

function openMenu(): HTMLElement {
  const link = document.createElement("a");
  link.setAttribute("href", "/example/status/1");
  document.body.appendChild(link);
  link.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    }),
  );
  const menu = document.getElementById("tv-context-menu");
  if (!menu) throw new Error("menu not found");
  return menu;
}

describe("inject/context_menu の表示言語", () => {
  beforeAll(async () => {
    // リスナーが二重登録されないよう、このファイルでは一度だけ import する
    vi.resetModules();
    await import("./context_menu");
  });

  afterEach(() => {
    document.getElementById("tv-context-menu")?.remove();
    document.body.innerHTML = "";
    window.__mcxI18n?.setLang("ja");
  });

  it("日本語のときメニュー項目は従来と同じ文言になる", () => {
    expect(openMenu().textContent).toBe("ポップアップウィンドウで開く");
  });

  it("表示言語が英語のときメニュー項目が英語になり日本語を含まない", () => {
    window.__mcxI18n?.setLang("en");

    const text = openMenu().textContent ?? "";

    expect(text).toBe("Open in popup window");
    expect(containsJapanese(text)).toBe(false);
  });

  it("メニュー表示中に表示言語を切り替えると表示済みのメニュー項目も切り替わる", () => {
    const menu = openMenu();
    expect(menu.textContent).toBe("ポップアップウィンドウで開く");

    window.__mcxI18n?.setLang("en");

    expect(menu.textContent).toBe("Open in popup window");
  });
});

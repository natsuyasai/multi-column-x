// notification_header_hide.ts は IIFE のため、import 時に実行され、
// 通知ページの重複ヘッダーを非表示にする CSS が head に追加される。
// 副作用（追加された style 要素とその内容）を検証する。
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const STYLE_ID = "multi-column-x-notification-header-hide";

async function importNotificationHeaderHide(): Promise<void> {
  vi.resetModules();
  await import("./notification_header_hide");
}

describe("inject/notification_header_hide", () => {
  beforeEach(() => {
    document.getElementById(STYLE_ID)?.remove();
  });

  it("importするとstyle要素がheadに追加される", async () => {
    await importNotificationHeaderHide();

    const style = document.getElementById(STYLE_ID);
    expect(style?.tagName).toBe("STYLE");
    expect(style?.parentElement).toBe(document.head);
  });

  it("settingsAppBarへのリンクを含む要素を対象にするセレクタが含まれる", async () => {
    await importNotificationHeaderHide();

    const style = document.getElementById(STYLE_ID);
    expect(style?.textContent).toContain('a[data-testid="settingsAppBar"]');
  });

  it("設定リンクのhref条件が含まれる", async () => {
    await importNotificationHeaderHide();

    const style = document.getElementById(STYLE_ID);
    expect(style?.textContent).toContain('href="/settings/notifications"');
  });

  it("通知タイムラインnavを持つ要素を除外する条件が含まれる", async () => {
    await importNotificationHeaderHide();

    const style = document.getElementById(STYLE_ID);
    expect(style?.textContent).toContain(
      ':not(:has(nav[aria-label="通知タイムライン"]))',
    );
  });

  it("display: noneがimportant付きで指定される", async () => {
    await importNotificationHeaderHide();

    const style = document.getElementById(STYLE_ID);
    expect(style?.textContent).toContain("display: none !important");
  });

  it("既に同IDのstyle要素が存在する場合は再度importしても重複追加されない", async () => {
    await importNotificationHeaderHide();
    await importNotificationHeaderHide();

    const styles = document.querySelectorAll(`#${CSS.escape(STYLE_ID)}`);
    expect(styles).toHaveLength(1);
  });

  describe("document.headが存在しない場合", () => {
    afterEach(() => {
      if (!document.head) {
        document.documentElement.appendChild(document.createElement("head"));
      }
    });

    it("document.headが存在しない状態でimportしてもエラーにならない", async () => {
      document.head.remove();

      await expect(importNotificationHeaderHide()).resolves.not.toThrow();
    });

    it("document.headが存在しない状態でimport後domcontentloadedイベント発火後にstyle要素が追加される", async () => {
      document.head.remove();

      await importNotificationHeaderHide();
      expect(document.getElementById(STYLE_ID)).toBeNull();

      document.documentElement.appendChild(document.createElement("head"));
      document.dispatchEvent(new Event("DOMContentLoaded"));

      const style = document.getElementById(STYLE_ID);
      expect(style?.tagName).toBe("STYLE");
      expect(style?.parentElement).toBe(document.head);
    });

    it("document.headが最初から存在する場合は従来通り即座にstyle要素が追加される", async () => {
      await importNotificationHeaderHide();

      const style = document.getElementById(STYLE_ID);
      expect(style?.tagName).toBe("STYLE");
      expect(style?.parentElement).toBe(document.head);
    });
  });
});

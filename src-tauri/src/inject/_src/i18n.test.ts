// i18n.ts は IIFE のため import 時に実行され、window.__mcxI18n を公開する。
import { describe, it, expect, vi, beforeEach } from "vitest";

type Win = { __mcxI18n?: McxI18n; __mcxLang?: string };

async function loadHub(lang?: string): Promise<McxI18n> {
  vi.resetModules();
  const w = window as unknown as Win;
  delete w.__mcxI18n;
  if (lang === undefined) delete w.__mcxLang;
  else w.__mcxLang = lang;
  await import("./i18n");
  return w.__mcxI18n as McxI18n;
}

// 現行の日本語文言（実コードの文言そのまま）。辞書の ja が変わったら検出する。
const JA_EXPECTED: Record<string, string> = {
  "contextMenu.openInPopup": "ポップアップウィンドウで開く",
  "header.toggleNav.hide": "ナビゲーションを非表示",
  "header.toggleNav.show": "ナビゲーションを表示",
  "header.link.home": "ホーム",
  "header.link.search": "調べたいものを検索",
  "header.link.notifications": "通知",
  "header.link.messages": "ダイレクトメッセージ",
  "header.link.lists": "リスト",
  "header.link.bookmarks": "ブックマーク",
  "header.link.communities": "コミュニティ",
  "header.link.premium": "プレミアム",
  "header.link.profile": "プロフィール",
  "header.link.compose": "ポストする",
  "header.compose": "ポストする",
  "header.close": "閉じる",
  "popupToolbar.download.completed": "ダウンロード完了{file}",
  "popupToolbar.download.failed": "ダウンロード失敗{file}",
  "popupToolbar.download.downloading": "ダウンロード中{file}",
  "popupToolbar.download.downloadingPercent": "ダウンロード中{file} {percent}%",
  "popupToolbar.account": "アカウント: ",
  "popupToolbar.downloadVideo": "動画をダウンロード",
  "popupToolbar.playBeforeDownload":
    "動画を再生してからダウンロードしてください",
  "popupToolbar.applyToColumns": "各カラムに適用",
  "popupToolbar.settingsNotFound": "設定が見つかりませんでした",
  "popupToolbar.applied": "各カラムに適用しました",
  "popupToolbar.exit": "終了",
  "lastRead.notFound": "前回の位置が見つかりませんでした",
  "lastRead.aria": "前回の続きへ戻る",
  "lastRead.ariaClose": "前回の続きへ戻るボタンを閉じる",
  "lastRead.searching": "探しています…",
  "lastRead.label": "↓ 前回の続きへ",
  "videoMenu.download": "動画をダウンロード",
  "videoMenu.popup": "動画をポップアップで表示",
};

describe("inject/i18n", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("日本語では全キーが従来の日本語文言と一致する", async () => {
    const hub = await loadHub("ja");
    for (const [key, expected] of Object.entries(JA_EXPECTED)) {
      expect(hub.t(key, { file: "{file}", percent: "{percent}" })).toBe(
        expected,
      );
    }
  });

  it("英語では英語の文言を返す", async () => {
    const hub = await loadHub("en");
    expect(hub.t("contextMenu.openInPopup")).toBe("Open in popup window");
    expect(hub.t("header.link.home")).toBe("Home");
    expect(hub.t("header.compose")).toBe("Post");
    expect(hub.t("popupToolbar.exit")).toBe("Exit");
  });

  it("未知のキーはキー文字列をそのまま返す", async () => {
    const hub = await loadHub("en");
    expect(hub.t("no.such.key")).toBe("no.such.key");
    const hubJa = await loadHub("ja");
    expect(hubJa.t("no.such.key")).toBe("no.such.key");
  });

  it("補間で変数が差し込まれ、未指定の変数はそのまま残る", async () => {
    const ja = await loadHub("ja");
    expect(
      ja.t("popupToolbar.download.downloadingPercent", {
        file: " (1/2)",
        percent: 42,
      }),
    ).toBe("ダウンロード中 (1/2) 42%");
    const en = await loadHub("en");
    expect(
      en.t("popupToolbar.download.downloadingPercent", {
        file: "",
        percent: 7,
      }),
    ).toBe("Downloading 7%");
    expect(en.t("popupToolbar.download.completed", {})).toBe(
      "Download complete{file}",
    );
  });

  it("jaとenでキー集合と補間変数名が一致する", async () => {
    const hubJa = await loadHub("ja");
    const hubEn = await loadHub("en");
    const probe = (hub: McxI18n, key: string): string[] => {
      // 全変数に番兵を差し込み、残った {name} を数える代わりに既知の変数集合で比較する
      const raw = hub.t(key);
      return Array.from(raw.matchAll(/\{(\w+)\}/g))
        .map((m) => m[1])
        .sort();
    };
    for (const key of Object.keys(JA_EXPECTED)) {
      expect(hubEn.t(key)).not.toBe(key);
      // 英語の辞書に無いキーは ja 辞書へフォールバックするため、日本語のままになっていないことも確認する
      expect(hubEn.t(key)).not.toBe(JA_EXPECTED[key]);
      expect(probe(hubEn, key)).toEqual(probe(hubJa, key));
    }
  });

  it("未対応の言語は英語として扱う", async () => {
    const hub = await loadHub("fr");
    expect(hub.lang).toBe("en");
    expect(hub.t("header.link.home")).toBe("Home");
    hub.setLang("de");
    expect(hub.lang).toBe("en");
  });

  it("初期言語は__mcxLangで決まり、未定義なら日本語になる", async () => {
    expect((await loadHub("en")).lang).toBe("en");
    expect((await loadHub("ja")).lang).toBe("ja");
    const hub = await loadHub(undefined);
    expect(hub.lang).toBe("ja");
    expect(hub.t("header.close")).toBe("閉じる");
  });

  it("applyで文言と属性を設定しsetLangで再適用される", async () => {
    const hub = await loadHub("ja");
    const btn = document.createElement("button");
    const close = document.createElement("button");
    document.body.append(btn, close);
    hub.apply(btn, "popupToolbar.exit");
    hub.apply(close, "header.close", { attr: "aria-label" });
    expect(btn.textContent).toBe("終了");
    expect(btn.getAttribute("data-mcx-i18n")).toBe("popupToolbar.exit");
    expect(close.getAttribute("aria-label")).toBe("閉じる");
    expect(close.getAttribute("data-mcx-i18n-attr")).toBe(
      "aria-label:header.close",
    );

    hub.setLang("en");
    expect(hub.lang).toBe("en");
    expect(btn.textContent).toBe("Exit");
    expect(close.getAttribute("aria-label")).toBe("Close");

    hub.setLang("ja");
    expect(btn.textContent).toBe("終了");
    expect(close.getAttribute("aria-label")).toBe("閉じる");
  });

  it("setLangでonChangeのコールバックが新しい言語で呼ばれ、解除できる", async () => {
    const hub = await loadHub("ja");
    const cb = vi.fn();
    const off = hub.onChange(cb);
    hub.setLang("en");
    expect(cb).toHaveBeenCalledWith("en");
    off();
    hub.setLang("ja");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("二重に読み込んでも既存のハブを置き換えない", async () => {
    const hub = await loadHub("en");
    const w = window as unknown as Win;
    await import("./i18n");
    expect(w.__mcxI18n).toBe(hub);
  });
});

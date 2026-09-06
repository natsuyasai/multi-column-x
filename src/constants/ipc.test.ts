// WEBVIEW_SCRIPTS の生成スクリプトを検証する単体テスト。
import { describe, it, expect } from "vitest";
import {
  WEBVIEW_SCRIPTS,
  OFFICIAL_SETTINGS_WHITELIST_KEYS,
} from "@/constants/ipc";

describe("WEBVIEW_SCRIPTS.applyAreaVisibility", () => {
  it("hideHeaderEnabledとhideTweetInputEnabledをwindow.__multiColumnXConfigに書き込むスクリプトを生成する", () => {
    const script = WEBVIEW_SCRIPTS.applyAreaVisibility(true, false);

    expect(script).toContain(
      "window.__multiColumnXConfig.hideHeaderEnabled=true",
    );
    expect(script).toContain(
      "window.__multiColumnXConfig.hideTweetInputEnabled=false",
    );
  });

  it("window.__multiColumnX.applyAreaVisibilityを引数付きで呼び出すスクリプトを生成する", () => {
    const script = WEBVIEW_SCRIPTS.applyAreaVisibility(true, false);

    expect(script).toContain(
      "window.__multiColumnX.applyAreaVisibility(true, false)",
    );
  });

  it("window.__multiColumnX.applyLayersHideを呼び出すスクリプトを生成する", () => {
    const script = WEBVIEW_SCRIPTS.applyAreaVisibility(true, false);

    expect(script).toContain("window.__multiColumnX.applyLayersHide()");
  });
});

describe("WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot", () => {
  it("生成スクリプトのCookie設定処理でdomain=.x.comを明示している", () => {
    const snapshotJson = JSON.stringify({ local: {}, nightMode: "auto" });
    const script = WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(snapshotJson);
    expect(script).toContain("domain=.x.com");
  });

  it("生成スクリプトのCookie削除処理でdomain=.x.comを明示している", () => {
    const snapshotJson = JSON.stringify({ local: {}, nightMode: null });
    const script = WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(snapshotJson);
    expect(script).toContain("domain=.x.com");
  });

  it("existing._lastPersisted とexisting.local._lastPersisted の両方を更新するコードが含まれる", () => {
    const snapshotJson = JSON.stringify({ local: {}, nightMode: "auto" });
    const script = WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(snapshotJson);
    expect(script).toContain("existing._lastPersisted");
    expect(script).toContain("existing.local._lastPersisted");
  });

  it("OFFICIAL_SETTINGS_WHITELIST_KEYS内のキー名がkeysJson部分に含まれる", () => {
    const snapshotJson = JSON.stringify({ local: {}, nightMode: "auto" });
    const script = WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(snapshotJson);
    const keysJsonString = JSON.stringify(OFFICIAL_SETTINGS_WHITELIST_KEYS);
    expect(script).toContain(keysJsonString);
  });

  it("scaleという文字列がホワイトリスト配列部分には含まれない", () => {
    const snapshotJson = JSON.stringify({ local: {}, nightMode: "auto" });
    const script = WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(snapshotJson);
    // keysJson で keys= の後に続く配列として "scale" が含まれていないことを確認
    const keysMatch = script.match(/var keys=(\[.*?\])/);
    expect(keysMatch).not.toBeNull();
    if (keysMatch) {
      const keysArray = keysMatch[1];
      expect(keysArray).not.toContain('"scale"');
    }
  });

  it("渡されたsnapshotJsonがvar incoming=の後に埋め込まれる", () => {
    const snapshotJson1 = JSON.stringify({
      local: { themeColor: "blue" },
      nightMode: "auto",
    });
    const script1 =
      WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(snapshotJson1);
    expect(script1).toContain("var incoming=" + snapshotJson1);

    const snapshotJson2 = JSON.stringify({
      local: { themeColor: "red" },
      nightMode: null,
    });
    const script2 =
      WEBVIEW_SCRIPTS.applyOfficialSettingsSnapshot(snapshotJson2);
    expect(script2).toContain("var incoming=" + snapshotJson2);
  });
});

describe("WEBVIEW_SCRIPTS.applyNightModeCookie", () => {
  it("night_modeというCookie名を参照するスクリプトを生成する", () => {
    const script = WEBVIEW_SCRIPTS.applyNightModeCookie("2");
    expect(script).toContain("night_mode");
  });

  it("渡した値がJSON.stringifyされた形でvar n=の後に埋め込まれる", () => {
    const script = WEBVIEW_SCRIPTS.applyNightModeCookie("2");
    expect(script).toContain("var n=" + JSON.stringify("2"));
  });

  it("domain=.x.comを明示している", () => {
    const script = WEBVIEW_SCRIPTS.applyNightModeCookie("0");
    expect(script).toContain("domain=.x.com");
  });

  it("location.reload()の呼び出しが含まれる", () => {
    const script = WEBVIEW_SCRIPTS.applyNightModeCookie("0");
    expect(script).toContain("location.reload()");
  });

  it("既存Cookie値と同じ場合は書き込まずに終了する分岐が含まれる", () => {
    const script = WEBVIEW_SCRIPTS.applyNightModeCookie("2");
    expect(script).toContain("current===n)return;");
  });
});

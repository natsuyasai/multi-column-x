// WEBVIEW_SCRIPTS.applyAreaVisibility の生成スクリプトを検証する単体テスト。
import { describe, it, expect } from "vitest";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";

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

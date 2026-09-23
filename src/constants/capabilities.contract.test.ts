// X 上のページ（remote webview）に付与する capability のドリフト検出。
// column-webview.json は x.com / twitter.com のリモートページから読み込まれるため、
// core:default 等の広い権限を付けるとイベントの emit/emit_to を偽装されうる。
// 購読(listen)・購読解除(unlisten)のみを許可し、送信系は含めないことを固定する。
import { describe, it, expect } from "vitest";
import columnWebviewCapability from "../../src-tauri/capabilities/column-webview.json";

describe("column-webview capabilityの契約", () => {
  it("X上のページ向けの権限にはイベントの購読と購読解除だけが含まれ送信は含まれない", () => {
    const permissions = columnWebviewCapability.permissions;

    expect(permissions).toContain("core:event:allow-listen");
    expect(permissions).toContain("core:event:allow-unlisten");

    expect(permissions).not.toContain("core:default");
    expect(permissions).not.toContain("core:event:default");
    expect(permissions).not.toContain("core:event:allow-emit");
    expect(permissions).not.toContain("core:event:allow-emit-to");
  });
});

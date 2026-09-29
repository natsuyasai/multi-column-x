// メイン画面（src/ 側 WebView）の CSP を最小化した状態に固定する契約テスト。
// tauri.conf.json の app.security.csp を JSON として import し、
// ディレクティブごとの許可ソースが想定どおりであることを検証する。
import { describe, it, expect } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";

function parseCsp(csp: string): Record<string, string[]> {
  return csp
    .split(";")
    .map((directive) => directive.trim())
    .filter((directive) => directive.length > 0)
    .reduce<Record<string, string[]>>((acc, directive) => {
      const [name, ...sources] = directive.split(/\s+/);
      acc[name] = sources;
      return acc;
    }, {});
}

describe("メイン画面CSPの契約", () => {
  it("メイン画面の通信先はアプリ自身とIPCとGitHub APIだけが許可されている", () => {
    const csp = tauriConf.app.security.csp;
    const directives = parseCsp(csp);

    const connectSrc = new Set(directives["connect-src"]);

    expect(connectSrc).toEqual(
      new Set([
        "'self'",
        "ipc:",
        "http://ipc.localhost",
        "https://api.github.com",
      ]),
    );
    expect(connectSrc.has("https:")).toBe(false);
    expect(connectSrc.has("*")).toBe(false);
  });

  it("メイン画面の画像はアプリ自身とdata URLだけが許可されている", () => {
    const csp = tauriConf.app.security.csp;
    const directives = parseCsp(csp);

    const imgSrc = new Set(directives["img-src"]);

    expect(imgSrc).toEqual(new Set(["'self'", "data:"]));
    expect(imgSrc.has("https:")).toBe(false);
  });

  it("スクリプトの読み込み元はアプリ自身だけのまま変わらない", () => {
    const csp = tauriConf.app.security.csp;
    const directives = parseCsp(csp);

    const scriptSrc = new Set(directives["script-src"]);

    expect(scriptSrc).toEqual(new Set(["'self'"]));
    expect(scriptSrc.has("'unsafe-inline'")).toBe(false);
    expect(scriptSrc.has("'unsafe-eval'")).toBe(false);
  });
});

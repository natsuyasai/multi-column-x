// mod.rs は inject の .js を 1 本のスクリプトに連結して実行する。
// ファイル間でトップレベル宣言名が衝突すると SyntaxError で注入全体が動かなくなるため、
// ビルド済み .js を mod.rs の連結対象どおりに連結して構文だけを検証する（実行はしない）。
// ビルド済み .js が無い環境（build:inject 前）ではスキップする。
import { describe, it, expect } from "vitest";

// mod.rs の script_parts / build_init_script が include_str! で連結する対象
const CONCAT_TARGETS = [
  "dom_observer",
  "i18n",
  "tab_selector",
  "header_customizer",
  "auto_reload",
  "return_to_last_read",
  "video_control",
  "mediaviewer_autoplay",
  "small_image",
  "blur_image",
  "hide_ad",
  "ng_word",
  "custom_css",
  "image_popup",
  "context_menu",
  "scroll_event",
  "keyboard_shortcut",
  "sidebar_hide",
  "mobile_area_hide",
  "notification_header_hide",
  "compose_only",
  "video_long_press_menu",
  "api_rate_limit_monitor",
];

const built = import.meta.glob("../*.js", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const hasBuilt = Object.keys(built).length > 0;

describe.skipIf(!hasBuilt)("注入スクリプトの連結", () => {
  it("注入スクリプトを連結してもトップレベル宣言が衝突しない", () => {
    const parts = CONCAT_TARGETS.map((name) => {
      const source = built[`../${name}.js`];
      expect(source, `${name}.js がビルドされている`).toBeDefined();
      return source;
    });
    // 構文チェックのみ（new Function は生成するだけで呼び出さない）
    expect(() => new Function(parts.join("\n"))).not.toThrow();
  });
});

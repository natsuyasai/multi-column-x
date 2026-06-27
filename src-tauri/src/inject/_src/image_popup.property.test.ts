// image_popup.ts / popup_video_autoplay.ts の純粋関数に対する fast-check プロパティテスト。
// image_popup.ts は import 時に IIFE が document へ click リスナーを登録するが、
// jsdom 環境では副作用なく読み込めるため純粋関数のみを検証対象にする。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildVideoUrl, classifyMediaHref, isMediaLink } from "./image_popup";
import { shouldAutoplay } from "./popup_video_autoplay";

// 現実的な URL 構成要素のジェネレータ（/ や ? # 等の特殊文字を混入させない）
const userArb = fc.stringMatching(/^[A-Za-z0-9_]+$/);
const idArb = fc.integer({ min: 1 }).map((n) => String(n));
const indexArb = fc.integer({ min: 1 });

describe("classifyMediaHref / isMediaLink プロパティ", () => {
  it("任意の文字列に対し戻り値は image / video / null のいずれか一つに必ず収まる（全域性）", () => {
    fc.assert(
      fc.property(fc.string(), (href) => {
        const kind = classifyMediaHref(href);
        expect([null, "image", "video"]).toContain(kind);
      }),
    );
  });

  it("任意の文字列に対し isMediaLink(href) は classifyMediaHref(href) !== null と常に一致する", () => {
    fc.assert(
      fc.property(fc.string(), (href) => {
        expect(isMediaLink(href)).toBe(classifyMediaHref(href) !== null);
      }),
    );
  });

  it("有効な video パスは常に video に分類される", () => {
    fc.assert(
      fc.property(userArb, idArb, indexArb, (user, id, index) => {
        const href = `/${user}/status/${id}/video/${index}`;
        expect(classifyMediaHref(href)).toBe("video");
      }),
    );
  });

  it("image マーカーと video マーカーを併せ持つ href は video が優先される（排他・優先）", () => {
    fc.assert(
      fc.property(userArb, idArb, idArb, indexArb, (user, id1, id2, index) => {
        // 前半は image にマッチ（/i/status/<id>）、後半は video にマッチ（/status/<id>/video/）
        const imagePart = `/i/status/${id1}`;
        const videoPart = `/${user}/status/${id2}/video/${index}`;
        const href = `${imagePart}${videoPart}`;
        // 両方のパターンを含むが video 判定が優先される
        expect(classifyMediaHref(href)).toBe("video");
      }),
    );
  });

  it("有効な photo パスは常に image に分類される", () => {
    fc.assert(
      fc.property(userArb, idArb, indexArb, (user, id, index) => {
        const href = `/${user}/status/${id}/photo/${index}`;
        expect(classifyMediaHref(href)).toBe("image");
      }),
    );
  });

  it("/i/status/<id> 形式は常に image に分類される", () => {
    fc.assert(
      fc.property(idArb, (id) => {
        expect(classifyMediaHref(`/i/status/${id}`)).toBe("image");
      }),
    );
  });

  it("同一 id でも photo は image・video は video に分類され衝突しない", () => {
    fc.assert(
      fc.property(userArb, idArb, indexArb, (user, id, index) => {
        const photoHref = `/${user}/status/${id}/photo/${index}`;
        const videoHref = `/${user}/status/${id}/video/${index}`;
        expect(classifyMediaHref(photoHref)).toBe("image");
        expect(classifyMediaHref(videoHref)).toBe("video");
      }),
    );
  });
});

describe("buildVideoUrl × shouldAutoplay クロス不変条件", () => {
  it("status パーマリンクから生成した URL は必ず shouldAutoplay が true になり https:// の絶対 URL である", () => {
    fc.assert(
      fc.property(userArb, idArb, indexArb, (user, id, index) => {
        const permalink = `/${user}/status/${id}`;
        const url = buildVideoUrl(permalink, index);
        // buildVideoUrl の出力は必ず /video/ を含むため自動再生対象になる
        expect(shouldAutoplay(url)).toBe(true);
        // 相対パス入力は https://x.com を補完した絶対 URL になる
        expect(url.startsWith("https://")).toBe(true);
      }),
    );
  });

  it("status の後に余分なセグメントが付いたパーマリンクでも /video/ 付き絶対 URL を生成する", () => {
    fc.assert(
      fc.property(
        userArb,
        idArb,
        indexArb,
        // 末尾セグメントは別の /status/<id> を生まない英字のみに限定する
        // （greedy な base 抽出正規表現が再アンカーしないようにするため）
        fc.stringMatching(/^[A-Za-z]+$/),
        (user, id, index, trailing) => {
          const permalink = `/${user}/status/${id}/${trailing}`;
          const url = buildVideoUrl(permalink, index);
          expect(shouldAutoplay(url)).toBe(true);
          expect(url.startsWith("https://")).toBe(true);
          // 末尾セグメントは除去され /status/<id>/video/<index> で終わる
          expect(url.endsWith(`/status/${id}/video/${index}`)).toBe(true);
        },
      ),
    );
  });
});

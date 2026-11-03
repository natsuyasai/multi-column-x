// isMediaViewerPath の性質: 先行するパス内容に依存せず、
// 「末尾セグメントが mediaviewer か否か」だけで判定されることを検証する。
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isMediaViewerPath } from "./video_control";

// スラッシュを含まない URL パスセグメント。大文字小文字を区別せず mediaviewer と
// 一致するものは除く (X は mediaviewer を mediaViewer に書き換えるため同じ扱い)。
const segment = fc
  .stringMatching(/^[A-Za-z0-9_]+$/)
  .filter((s) => s.length > 0 && s.toLowerCase() !== "mediaviewer");

// "mediaviewer" の各文字の大文字小文字をランダムに変えた表記
const mediaViewerCase = fc
  .array(fc.boolean(), { minLength: 11, maxLength: 11 })
  .map((flags) =>
    [..."mediaviewer"].map((c, i) => (flags[i] ? c.toUpperCase() : c)).join(""),
  );

describe("inject/video_control isMediaViewerPath プロパティ", () => {
  it("末尾セグメントが mediaviewer なら、先行パスに関わらず true", () => {
    fc.assert(
      fc.property(fc.array(segment), fc.boolean(), (prefix, trailingSlash) => {
        const path = `/${[...prefix, "mediaviewer"].join("/")}${
          trailingSlash ? "/" : ""
        }`;
        expect(isMediaViewerPath(path)).toBe(true);
      }),
    );
  });

  it("末尾セグメントが大文字小文字違いの mediaviewer でも true", () => {
    fc.assert(
      fc.property(
        fc.array(segment),
        mediaViewerCase,
        fc.boolean(),
        (prefix, last, trailingSlash) => {
          const path = `/${[...prefix, last].join("/")}${
            trailingSlash ? "/" : ""
          }`;
          expect(isMediaViewerPath(path)).toBe(true);
        },
      ),
    );
  });

  it("mediaviewer の後ろにセグメントが続く場合は false", () => {
    fc.assert(
      fc.property(
        fc.array(segment),
        mediaViewerCase,
        segment,
        (prefix, viewer, suffix) => {
          const path = `/${[...prefix, viewer, suffix].join("/")}`;
          expect(isMediaViewerPath(path)).toBe(false);
        },
      ),
    );
  });

  it("末尾セグメントが mediaviewer 以外なら false", () => {
    fc.assert(
      fc.property(fc.array(segment), segment, (prefix, last) => {
        const path = `/${[...prefix, last].join("/")}`;
        expect(isMediaViewerPath(path)).toBe(false);
      }),
    );
  });
});

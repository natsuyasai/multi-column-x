// isMediaViewerPath の性質: 先行するパス内容に依存せず、
// 「末尾セグメントが mediaviewer か否か」だけで判定されることを検証する。
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isMediaViewerPath } from "./video_control";

// スラッシュを含まない URL パスセグメント
const segment = fc
  .stringMatching(/^[A-Za-z0-9_]+$/)
  .filter((s) => s.length > 0 && s !== "mediaviewer");

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

  it("mediaviewer の後ろにセグメントが続く場合は false", () => {
    fc.assert(
      fc.property(fc.array(segment), segment, (prefix, suffix) => {
        const path = `/${[...prefix, "mediaviewer", suffix].join("/")}`;
        expect(isMediaViewerPath(path)).toBe(false);
      }),
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

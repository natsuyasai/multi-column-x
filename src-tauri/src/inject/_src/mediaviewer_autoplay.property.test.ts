// isMediaViewerPath の性質: 先行するパス内容に依存せず、
// 「末尾セグメントが mediaviewer か否か」だけで判定されることを検証する。
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  isMediaViewerPath,
  pickMostVisibleVideo,
} from "./mediaviewer_autoplay";

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

describe("inject/mediaviewer_autoplay isMediaViewerPath プロパティ", () => {
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

// getBoundingClientRect だけを持つ最小の動画
interface FakeVideo {
  readonly id: number;
  getBoundingClientRect(): {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
}

const rect = fc.record({
  top: fc.integer({ min: -2000, max: 2000 }),
  left: fc.integer({ min: -2000, max: 2000 }),
  width: fc.integer({ min: 0, max: 2000 }),
  height: fc.integer({ min: 0, max: 2000 }),
});

const viewport = fc.record({
  width: fc.integer({ min: 1, max: 1500 }),
  height: fc.integer({ min: 1, max: 1500 }),
});

function visibleArea(
  v: FakeVideo,
  size: { width: number; height: number },
): number {
  const r = v.getBoundingClientRect();
  const w = Math.min(r.right, size.width) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, size.height) - Math.max(r.top, 0);
  return Math.max(0, w) * Math.max(0, h);
}

const fakeVideos = fc
  .array(rect, { minLength: 1, maxLength: 6 })
  .map((rects): FakeVideo[] =>
    rects.map((r, id) => ({
      id,
      getBoundingClientRect: () => ({
        top: r.top,
        left: r.left,
        bottom: r.top + r.height,
        right: r.left + r.width,
      }),
    })),
  );

describe("inject/mediaviewer_autoplay pickMostVisibleVideo プロパティ", () => {
  it("動画が1つ以上あれば必ず入力のいずれかを返す", () => {
    fc.assert(
      fc.property(fakeVideos, viewport, (videos, size) => {
        const picked = pickMostVisibleVideo(videos, size.width, size.height);
        expect(videos).toContain(picked);
      }),
    );
  });

  it("選ばれた動画の可視面積は他のどの動画よりも小さくない", () => {
    fc.assert(
      fc.property(fakeVideos, viewport, (videos, size) => {
        const picked = pickMostVisibleVideo(videos, size.width, size.height)!;
        const pickedArea = visibleArea(picked, size);
        for (const v of videos) {
          expect(pickedArea).toBeGreaterThanOrEqual(visibleArea(v, size));
        }
      }),
    );
  });

  it("可視面積が最大の動画が複数あるときは最初のものを選ぶ", () => {
    fc.assert(
      fc.property(fakeVideos, viewport, (videos, size) => {
        const picked = pickMostVisibleVideo(videos, size.width, size.height)!;
        const pickedArea = visibleArea(picked, size);
        const firstMax = videos.find(
          (v) => visibleArea(v, size) === pickedArea,
        );
        expect(picked).toBe(firstMax);
      }),
    );
  });

  it("すべての動画の可視面積が 0 のときは先頭の動画を返す", () => {
    fc.assert(
      fc.property(fakeVideos, viewport, (videos, size) => {
        fc.pre(videos.every((v) => visibleArea(v, size) === 0));
        expect(pickMostVisibleVideo(videos, size.width, size.height)).toBe(
          videos[0],
        );
      }),
    );
  });
});

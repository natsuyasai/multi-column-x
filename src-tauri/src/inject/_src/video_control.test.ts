// video_control.ts は IIFE だが、mediaviewer 判定ロジックを純粋関数として
// named export しているため、それを直接検証する。
import { describe, it, expect } from "vitest";
import { isMediaViewerPath } from "./video_control";

describe("inject/video_control isMediaViewerPath", () => {
  it("mediaviewer で終わるパスは true", () => {
    expect(
      isMediaViewerPath("/ANIMA_info/status/2070703676067635303/mediaviewer"),
    ).toBe(true);
  });

  it("末尾スラッシュ付きの mediaviewer も true", () => {
    expect(
      isMediaViewerPath("/ANIMA_info/status/2070703676067635303/mediaviewer/"),
    ).toBe(true);
  });

  it("通常のタイムライン/ステータスのパスは false", () => {
    expect(isMediaViewerPath("/home")).toBe(false);
    expect(isMediaViewerPath("/ANIMA_info/status/2070703676067635303")).toBe(
      false,
    );
  });

  it("mediaviewer が末尾でない場合は false", () => {
    expect(isMediaViewerPath("/mediaviewer/something")).toBe(false);
  });

  it("mediaviewer を部分文字列として含むだけのパスは false", () => {
    expect(isMediaViewerPath("/foo/notmediaviewer")).toBe(false);
  });
});

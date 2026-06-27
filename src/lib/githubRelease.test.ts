import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReleaseNotes, parseLatestRelease } from "./githubRelease";

describe("parseLatestRelease", () => {
  it("tagからvを除いたversionとapk資産URLとbodyを返す", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        { name: "latest.json", browser_download_url: "https://x/latest.json" },
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
        },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      version: "1.2.0",
      notes: "修正",
      apkUrl: "https://x/app.apk",
    });
  });

  it("apk資産が無ければnull", () => {
    expect(parseLatestRelease({ tag_name: "v1.2.0", assets: [] })).toBeNull();
  });

  it("tag_nameが無ければnull", () => {
    expect(parseLatestRelease({ assets: [] })).toBeNull();
  });
});

describe("fetchReleaseNotes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常: bodyを返し、リクエストURLにv{version}が含まれる", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ body: "## What's New\n- バグ修正" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchReleaseNotes("1.2.0");

    expect(result).toBe("## What's New\n- バグ修正");
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("tags/v1.2.0");
  });

  it("versionがv始まりでもURLがvv二重にならない", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ body: "notes" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchReleaseNotes("v1.2.0");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("vv");
    expect(calledUrl).toContain("tags/v1.2.0");
  });

  it("res.okがfalseのときnullを返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await fetchReleaseNotes("1.2.0");

    expect(result).toBeNull();
  });

  it("bodyが空文字のときnullを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ body: "" }),
      }),
    );

    const result = await fetchReleaseNotes("1.2.0");

    expect(result).toBeNull();
  });

  it("bodyが未定義のときnullを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    const result = await fetchReleaseNotes("1.2.0");

    expect(result).toBeNull();
  });
});

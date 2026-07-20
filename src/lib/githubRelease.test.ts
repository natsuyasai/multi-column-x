import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchReleaseNotes,
  parseDigestSha256,
  parseLatestRelease,
} from "./githubRelease";

const VALID_SHA256 = "0123456789abcdef".repeat(4);

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

  it("apkアセットのdigestからapkSha256(小文字hex)を設定する", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
          digest: `sha256:${VALID_SHA256.toUpperCase()}`,
        },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      version: "1.2.0",
      notes: "修正",
      apkUrl: "https://x/app.apk",
      apkSha256: VALID_SHA256,
    });
  });

  it("digestが無ければapkSha256はundefined", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
        },
      ],
    };
    expect(parseLatestRelease(json)?.apkSha256).toBeUndefined();
  });

  it("digestがsha256でなければapkSha256はundefined", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
          digest: `sha512:${VALID_SHA256}`,
        },
      ],
    };
    expect(parseLatestRelease(json)?.apkSha256).toBeUndefined();
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

describe("parseDigestSha256", () => {
  it("sha256プレフィックス付き64桁hexを小文字で返す", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256}`)).toBe(VALID_SHA256);
  });

  it("大文字hexを小文字に正規化する", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256.toUpperCase()}`)).toBe(
      VALID_SHA256,
    );
  });

  it("undefinedはnull", () => {
    expect(parseDigestSha256(undefined)).toBeNull();
  });

  it("プレフィックスが無ければnull", () => {
    expect(parseDigestSha256(VALID_SHA256)).toBeNull();
  });

  it("sha256以外のアルゴリズム(sha512:)はnull", () => {
    expect(parseDigestSha256(`sha512:${VALID_SHA256}`)).toBeNull();
  });

  it("hexが64桁でなければnull(短い)", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256.slice(0, 63)}`)).toBeNull();
  });

  it("hexが64桁でなければnull(長い)", () => {
    expect(parseDigestSha256(`sha256:${VALID_SHA256}0`)).toBeNull();
  });

  it("非hex文字を含めばnull", () => {
    expect(
      parseDigestSha256(`sha256:${VALID_SHA256.slice(0, 63)}g`),
    ).toBeNull();
  });
});

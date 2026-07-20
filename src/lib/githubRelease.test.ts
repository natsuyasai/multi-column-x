import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchApkSha256,
  fetchReleaseNotes,
  parseLatestRelease,
  parseSha256Text,
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

  it("apk.sha256資産があればsha256Urlに設定する", () => {
    const json = {
      tag_name: "v1.2.0",
      body: "修正",
      assets: [
        {
          name: "MultiColumnX_1.2.0_universal.apk",
          browser_download_url: "https://x/app.apk",
        },
        {
          name: "MultiColumnX_1.2.0_universal.apk.sha256",
          browser_download_url: "https://x/app.apk.sha256",
        },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      version: "1.2.0",
      notes: "修正",
      apkUrl: "https://x/app.apk",
      sha256Url: "https://x/app.apk.sha256",
    });
  });

  it("apk.sha256資産が無ければsha256Urlはundefined", () => {
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
    expect(parseLatestRelease(json)?.sha256Url).toBeUndefined();
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

describe("parseSha256Text", () => {
  it("64桁hexのみのテキストをそのまま小文字で返す", () => {
    expect(parseSha256Text(VALID_SHA256)).toBe(VALID_SHA256);
  });

  it("hashとファイル名がスペース区切りのテキストから先頭のhashを返す", () => {
    expect(parseSha256Text(`${VALID_SHA256}  MultiColumnX.apk`)).toBe(
      VALID_SHA256,
    );
  });

  it("前後の空白・改行をtrimする", () => {
    expect(parseSha256Text(`\n  ${VALID_SHA256}  \n`)).toBe(VALID_SHA256);
  });

  it("大文字hexを小文字に正規化する", () => {
    expect(parseSha256Text(VALID_SHA256.toUpperCase())).toBe(VALID_SHA256);
  });

  it("64桁でないテキストはnull(短い)", () => {
    expect(parseSha256Text(VALID_SHA256.slice(0, 63))).toBeNull();
  });

  it("64桁でないテキストはnull(長い)", () => {
    expect(parseSha256Text(`${VALID_SHA256}0`)).toBeNull();
  });

  it("非hex文字を含むテキストはnull", () => {
    expect(parseSha256Text(`${VALID_SHA256.slice(0, 63)}g`)).toBeNull();
  });

  it("空文字はnull", () => {
    expect(parseSha256Text("")).toBeNull();
  });
});

describe("fetchApkSha256", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("res.okでparseSha256Textの結果を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `${VALID_SHA256}  MultiColumnX.apk\n`,
      }),
    );

    const result = await fetchApkSha256("https://x/app.apk.sha256");

    expect(result).toBe(VALID_SHA256);
  });

  it("res.okがfalseならnull", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await fetchApkSha256("https://x/app.apk.sha256");

    expect(result).toBeNull();
  });

  it("本文が不正フォーマットならnull", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "not a hash",
      }),
    );

    const result = await fetchApkSha256("https://x/app.apk.sha256");

    expect(result).toBeNull();
  });
});

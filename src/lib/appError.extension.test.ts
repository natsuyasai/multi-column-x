import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { containsJapanese } from "@/test-utils/japanese";
import { describeAppError } from "./appError";

type T = Parameters<typeof describeAppError>[1];
const tJa = i18n.getFixedT("ja") as unknown as T;
const tEn = i18n.getFixedT("en") as unknown as T;

/** 現行（多言語化前）の日本語文言。detail を含むものは `{detail}` に差し込む */
const JA_TEXTS: Record<string, string> = {
  "extension.notFound": "拡張機能が見つかりません",
  "extension.unsupported": "この環境では拡張機能に対応していません",
  "extension.alreadyAdded": "すでに追加されています",
  "extension.networkFolder":
    "ネットワークフォルダは追加できません。ローカルフォルダを指定してください",
  "extension.folderNotFound": "指定されたフォルダが見つかりません",
  "extension.folderRequired": "フォルダを指定してください",
  "extension.folderUnreadable": "拡張機能のフォルダを読み込めません",
  "extension.folderTooLarge": "拡張機能のフォルダが大きすぎます",
  "extension.noBrowser": "Chrome / Edge が見つかりません",
  "extension.notInBrowser": "ブラウザに該当する拡張機能が見つかりません",
  "extension.noPopup": "この拡張機能にはポップアップがありません",
  "extension.noOptions": "この拡張機能にはオプションページがありません",
  "extension.noPage": "開けるページがありません",
  "extension.disabled": "無効な拡張機能は開けません",
  "extension.invalidKind": "開くページの種類が不正です",
  "extension.invalidId": "拡張機能の ID が不正です",
  "extension.invalidEntryId": "entry_id に使用できない文字が含まれています",
  "extension.invalidPagePath": "拡張機能のページのパスが不正です",
  "extension.invalidUrl": "URL が不正です: {detail}",
  "extension.accountRequired": "アカウントを選択してください",
  "extension.columnRequired": "このアカウントのカラムを先に表示してください",
  "extension.noTarget": "このアカウントに拡張機能を適用できませんでした",
  "extension.destInsideSource": "コピー先が拡張機能のフォルダの内側にあります",
  "extension.manifestMissing":
    "拡張機能として読み込めません（manifest.json が見つかりません）",
  "extension.manifestInvalid":
    "拡張機能として読み込めません（manifest.json の内容が不正です）",
  "extension.unreadableFiles":
    "拡張機能に読み込めないファイルが含まれています（名前が「_」で始まるファイルなど）",
  "extension.loadFailedPath":
    "拡張機能を読み込めませんでした（パスを確認してください）",
  "extension.invalidDefinition": "拡張機能の定義が正しくありません",
  "extension.loadFailed":
    "拡張機能を読み込めませんでした（エラーコード {detail}）",
  "extension.listFailed": "拡張機能の一覧を取得できません（{detail}）",
  "extension.listCallFailed": "拡張機能の一覧を取得できません: {detail}",
  "extension.removeFailed": "拡張機能を削除できません（{detail}）",
  "extension.removeCallFailed": "拡張機能を削除できません: {detail}",
  "extension.setEnabledFailed":
    "拡張機能の有効状態を変更できません（{detail}）",
  "extension.setEnabledCallFailed":
    "拡張機能の有効状態を変更できません: {detail}",
  "extension.profileUnavailable": "プロファイルを取得できません: {detail}",
  "extension.webviewAccess": "WebView へアクセスできません: {detail}",
  "extension.noReply": "WebView2 から応答がありませんでした",
  "extension.timeout": "WebView2 の応答がタイムアウトしました",
};

const DETAIL = "0x80070002";

describe("拡張機能のエラーコードの翻訳", () => {
  it.each(Object.entries(JA_TEXTS))(
    "日本語表示では %s が従来と同じ文言になる",
    (code, text) => {
      const withDetail = text.includes("{detail}");

      const actual = describeAppError(
        withDetail ? { code, detail: DETAIL } : { code },
        tJa,
      );

      expect(actual).toBe(text.replace("{detail}", DETAIL));
    },
  );

  it.each(Object.keys(JA_TEXTS))(
    "英語表示では %s が日本語を含まない文言になる",
    (code) => {
      const actual = describeAppError({ code, detail: DETAIL }, tEn);

      expect(actual).not.toBe("");
      expect(containsJapanese(actual), actual).toBe(false);
      // 未知コード扱い（汎用文言）に落ちていない
      expect(actual).not.toBe(
        describeAppError({ code: "no.such", detail: DETAIL }, tEn),
      );
    },
  );

  it("詳細情報を含むエラーは詳細が文言に埋め込まれて表示される", () => {
    expect(
      describeAppError(
        { code: "extension.loadFailed", detail: "0x800700AB" },
        tEn,
      ),
    ).toBe("Couldn't load the extension (error code 0x800700AB)");
  });

  it("内部エラーは詳細をそのまま表示する", () => {
    expect(
      describeAppError({ code: "common.internal", detail: "boom: /a/b" }, tJa),
    ).toBe("boom: /a/b");
    expect(
      describeAppError({ code: "common.internal", detail: "boom: /a/b" }, tEn),
    ).toBe("boom: /a/b");
  });

  it("辞書にある拡張機能のコードは全てこの表に載っている", async () => {
    const { resources } = await import("@/i18n/resources");
    const dict = (
      resources.ja.messages as unknown as {
        rustError: { extension: Record<string, string> };
      }
    ).rustError.extension;

    const codes = Object.keys(dict).map((k) => `extension.${k}`);

    expect(codes.sort()).toEqual(Object.keys(JA_TEXTS).sort());
  });
});

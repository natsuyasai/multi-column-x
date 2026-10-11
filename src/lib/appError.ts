import type { AppTFunction } from "@/i18n/types";

/** Rust のコマンドが失敗時に返すエラー（種別コード＋詳細） */
export interface AppErrorInfo {
  code: string;
  detail?: string;
}

export function isAppError(value: unknown): value is AppErrorInfo {
  if (typeof value !== "object" || value === null) return false;
  const { code, detail } = value as Record<string, unknown>;
  return (
    typeof code === "string" &&
    code.length > 0 &&
    (detail === undefined || typeof detail === "string")
  );
}

/**
 * invoke の失敗値などを表示用の文言にする。
 * AppError は辞書 `messages:rustError.<code>` で翻訳し、未知のコードは汎用文言（詳細があれば付記）にする。
 * それ以外（Error・string・不明な値）は Rust 以外由来としてそのまま文字列化する。
 */
export function describeAppError(error: unknown, t: AppTFunction): string {
  if (isAppError(error)) {
    const { code, detail } = error;
    const fallback = detail
      ? t("messages:rustError.unknownWithDetail", { detail })
      : t("messages:rustError.unknown");
    // 動的キー（コードは Rust 側の定数で、辞書との対応は契約テストが保証する）
    return t(`messages:rustError.${code}` as never, {
      detail: detail ?? "",
      defaultValue: fallback,
    });
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

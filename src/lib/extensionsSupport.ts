import { platform } from "@tauri-apps/plugin-os";

/** 拡張機能の管理に対応する環境か（Windows デスクトップのみ） */
export function isExtensionsSupported(
  platformName: string,
  isMobile: boolean,
): boolean {
  return platformName === "windows" && !isMobile;
}

/** 現在の OS 名。取得できない環境（ブラウザ上の Storybook など）では空文字 */
export function currentPlatformName(): string {
  try {
    return platform();
  } catch {
    return "";
  }
}

/**
 * ポップアップ / オプションページを開くアカウントを決める。
 * 選択中のアカウント → 先頭カラムのアカウント → null の順。
 */
export function resolveExtensionPageAccountId(
  activeAccountId: string | null,
  columnAccountIds: string[],
): string | null {
  return activeAccountId || columnAccountIds[0] || null;
}

/** 起動時の自動チェックでダイアログを表示すべきか。見送り済みバージョンは抑制する。 */
export function shouldAutoPrompt(
  version: string,
  dismissed: string | null,
): boolean {
  return version !== dismissed;
}

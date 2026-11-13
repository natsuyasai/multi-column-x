const HIDE_AD_TEXTS = ["Ad", "Promoted", "広告"];
const HIDE_AD_FROM_PATTERN = /^Ad from\s+\S/i;

/** 広告ラベルとして表示されるテキストかを判定する（「Ad」「Promoted」「広告」「Ad from ○○」） */
export function isAdLabelText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (HIDE_AD_TEXTS.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
    return true;
  }
  return HIDE_AD_FROM_PATTERN.test(trimmed);
}

/** リンク群に広告計測パラメータ（twclid）付きのものがあるかを判定する */
export function hasAdTrackingHref(hrefs: string[]): boolean {
  return hrefs.some((href) => {
    try {
      const url = new URL(href, "https://x.com");
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.searchParams.has("twclid")
      );
    } catch {
      return false;
    }
  });
}

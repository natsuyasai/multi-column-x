const SCHEME_PATTERN = /^https?:\/\//i;

/** リンクポップアップに入力された URL の先頭がスキーム付きかどうかを判定し、無ければ https:// を補う。 */
export function resolveLinkPopupUrl(input: string): string {
  return SCHEME_PATTERN.test(input) ? input : `https://${input}`;
}

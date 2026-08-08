// src-tauri/src/inject/_src/ng_word_matcher.ts
// NGワード1件がツイート本文テキストに一致するかどうかを判定する（DOM非依存の純粋関数）

const REGEX_NG_WORD_PATTERN = /^\/(.+)\/([a-z]*)$/;

/**
 * NGワード1件がテキストに一致するか判定する。
 * "/pattern/flags" 形式は正規表現として判定し、常に大文字小文字を無視する。
 * 不正な正規表現・通常の文字列は部分一致（大小無視）にフォールバックする。
 */
export function matchesNgWord(text: string, rawWord: string): boolean {
  const match = REGEX_NG_WORD_PATTERN.exec(rawWord);
  if (match) {
    const [, pattern, flags] = match;
    const normalizedFlags = flags.includes("i") ? flags : flags + "i";
    try {
      const regex = new RegExp(pattern, normalizedFlags);
      return regex.test(text);
    } catch {
      // 構文エラーの正規表現は下のリテラル文字列判定にフォールバックする
    }
  }
  return text.toLowerCase().includes(rawWord.toLowerCase());
}

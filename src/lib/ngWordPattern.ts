// src/lib/ngWordPattern.ts
// NGワード1行が正規表現形式("/pattern/flags")かどうかの判定・検証（Tauri 非依存の純粋関数）

const REGEX_NG_WORD_PATTERN = /^\/(.+)\/([a-z]*)$/;

/**
 * NGワードの行が "/pattern/flags" 形式（正規表現リテラル）かどうかを判定する。
 * マッチしない場合は通常の部分一致文字列として扱う。
 */
export function isRegexNgWord(raw: string): boolean {
  return REGEX_NG_WORD_PATTERN.test(raw);
}

/**
 * NGワード1行を検証する。
 * "/pattern/flags" 形式でない場合（通常の部分一致文字列）は常に有効(null)。
 * "/pattern/flags" 形式で構文エラーの場合はエラーメッセージ文字列を返す。
 *
 * NGワードの判定は常に大小文字を無視する仕様のため、flagsに "i" が
 * 含まれていなければ内部で補って("i"を追加して)コンパイルを試みる。
 * 既に "i" を含む場合に単純に "+ 'i'" すると "ii" となり
 * `new RegExp` が SyntaxError を投げるため、includes チェックで防ぐ。
 */
export function validateNgWordLine(raw: string): string | null {
  const match = REGEX_NG_WORD_PATTERN.exec(raw);
  if (!match) {
    return null;
  }
  const [, pattern, flags] = match;
  const normalizedFlags = flags.includes("i") ? flags : flags + "i";
  try {
    new RegExp(pattern, normalizedFlags);
    return null;
  } catch {
    return `正規表現が不正です: ${raw}`;
  }
}

/**
 * NGワードの複数行を検証し、最初に見つかったエラーメッセージを返す（なければ null）。
 */
export function validateNgWordLines(lines: string[]): string | null {
  for (const line of lines) {
    const error = validateNgWordLine(line);
    if (error !== null) {
      return error;
    }
  }
  return null;
}

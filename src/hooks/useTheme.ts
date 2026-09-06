import { useEffect, useState } from "react";
import { resolveTheme, type ResolvedTheme } from "../lib/theme";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function getMql(): MediaQueryList | null {
  if (typeof matchMedia !== "function") return null;
  return matchMedia(MEDIA_QUERY);
}

/**
 * globalSettings.theme を解決済みテーマに変換し、
 * document.documentElement の data-theme 属性へ反映する。
 * "system" の間のみ OS 配色変更を購読してライブ追従する。
 * 戻り値は解決済みテーマ（"dark" | "light"）。呼び出し側が同じ解決値
 * （例: モバイルスワイプバーのネイティブオーバーレイへの反映）を必要とする場合、
 * matchMedia 購読ロジックを重複させずにこの戻り値を再利用できる。
 */
export function useTheme(theme: string): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(theme, getMql()?.matches ?? false),
  );

  useEffect(() => {
    const apply = (prefersDark: boolean) => {
      const next = resolveTheme(theme, prefersDark);
      document.documentElement.setAttribute("data-theme", next);
      setResolved(next);
    };

    const mql = getMql();
    apply(mql?.matches ?? false);

    if (theme !== "system" || !mql) return;

    const onChange = (e: MediaQueryListEvent | { matches: boolean }) => {
      apply(e.matches);
    };
    mql.addEventListener("change", onChange as (e: Event) => void);
    return () => {
      mql.removeEventListener("change", onChange as (e: Event) => void);
    };
  }, [theme]);

  return resolved;
}

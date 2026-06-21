import { useEffect } from "react";
import { resolveTheme } from "../lib/theme";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getMql(): MediaQueryList | null {
  if (typeof matchMedia !== "function") return null;
  return matchMedia(MEDIA_QUERY);
}

/**
 * globalSettings.theme を解決済みテーマに変換し、
 * document.documentElement の data-theme 属性へ反映する。
 * "system" の間のみ OS 配色変更を購読してライブ追従する。
 */
export function useTheme(theme: string): void {
  useEffect(() => {
    const apply = (prefersDark: boolean) => {
      document.documentElement.setAttribute(
        "data-theme",
        resolveTheme(theme, prefersDark),
      );
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
}

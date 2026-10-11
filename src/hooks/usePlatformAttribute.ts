import { useEffect } from "react";

/**
 * <html> に data-platform 属性（android / desktop）を付与する。
 * CSS からプラットフォーム別にスタイルを切り替えるために使う。
 */
export function usePlatformAttribute(isMobile: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-platform", isMobile ? "android" : "desktop");
    return () => {
      root.removeAttribute("data-platform");
    };
  }, [isMobile]);
}

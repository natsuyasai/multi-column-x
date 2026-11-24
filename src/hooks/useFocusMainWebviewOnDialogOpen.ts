import { useEffect } from "react";
import { logError } from "@/lib/log";
import { focusMainWebview } from "@/services/mainWebview";

/** ダイアログが開いた（anyDialogOpen が false→true）とき、デスクトップでメイン WebView へフォーカスを移す。 */
export function useFocusMainWebviewOnDialogOpen(
  anyDialogOpen: boolean,
  isMobile: boolean,
): void {
  useEffect(() => {
    if (!anyDialogOpen || isMobile) return;
    focusMainWebview().catch(logError("useFocusMainWebviewOnDialogOpen"));
  }, [anyDialogOpen, isMobile]);
}

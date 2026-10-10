// src/hooks/useMobileSwipeBarSync.ts
// モバイルスワイプバー（ネイティブオーバーレイ）の状態を Kotlin 側へ同期するフック。
// ダイアログ開閉時（(d)）の同期は App.tsx の anyDialogOpen effect からこのフックが
// 返す syncMobileSwipeBar を呼び出す形で行うため、ここには含めない。
import { useCallback, useEffect, useRef } from "react";
import {
  getMobileTabBarHeight,
  resolveSwipeAreaHeight,
} from "@/lib/gridLayout";
import { logError } from "@/lib/log";
import type { ResolvedTheme } from "@/lib/theme";
import { updateMobileSwipeBar } from "@/services/columnWebview";
import type { GlobalSettings } from "@/types";

interface UseMobileSwipeBarSyncArgs {
  isMobile: boolean;
  columnsRestored: boolean;
  globalSettings: GlobalSettings;
  anyDialogOpen: boolean;
  resolvedTheme: ResolvedTheme;
}

export function useMobileSwipeBarSync({
  isMobile,
  columnsRestored,
  globalSettings,
  anyDialogOpen,
  resolvedTheme,
}: UseMobileSwipeBarSyncArgs): () => void {
  // モバイルスワイプバー（ネイティブオーバーレイ）の状態を Kotlin 側へ同期する。
  // visible は「設定で有効」「透過度>0（0のまま表示し続けるとView.alphaが透明でもタッチを
  // 吸収してしまい、見えないのにタップを奪われる事故になるため非表示にする。詳細は
  // tmp/plans/2026-08-11-mobile-swipe-bar-native-overlay/plan.md の
  // 『View.alphaとヒットテストの関係』参照）」「ダイアログが開いていない」の全てを満たす場合のみ true。
  // y/height は mobileColumnLayout が算出する隙間の絶対座標と同じ計算式を使う（座標の単一ソース化。
  // Gravity+bottomMargin ではなく絶対 y にするのは、IME表示・回転時のズレを避けるため）。
  // カラム復元前・非モバイルでは呼ばない。
  const syncMobileSwipeBar = useCallback(() => {
    if (!isMobile || !columnsRestored) return;
    const swipeAreaHeight = resolveSwipeAreaHeight(globalSettings);
    const visible =
      globalSettings.mobileSwipeAreaEnabled &&
      globalSettings.mobileSwipeAreaOpacity > 0 &&
      !anyDialogOpen;
    const y = window.innerHeight - getMobileTabBarHeight() - swipeAreaHeight;
    updateMobileSwipeBar(
      visible,
      y,
      swipeAreaHeight,
      globalSettings.mobileSwipeAreaOpacity,
      resolvedTheme === "dark",
    ).catch(logError("syncMobileSwipeBar"));
  }, [isMobile, columnsRestored, globalSettings, anyDialogOpen, resolvedTheme]);

  // (a) 起動時: カラム復元完了後に初回反映する
  useEffect(() => {
    syncMobileSwipeBar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsRestored]);

  // (b) 設定変更時: スワイプ領域の有効/高さ/透過度が変わるたびに反映する
  useEffect(() => {
    syncMobileSwipeBar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    globalSettings.mobileSwipeAreaEnabled,
    globalSettings.mobileSwipeAreaHeight,
    globalSettings.mobileSwipeAreaOpacity,
  ]);

  // (c) テーマ変更時: useTheme の戻り値（resolvedTheme）は "system" 選択中の
  // OS配色変更にもライブ追従するため、この変化を見るだけで反映できる
  useEffect(() => {
    syncMobileSwipeBar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  // (e) 画面回転・ウィンドウリサイズ時: syncMobileSwipeBar 内の y は
  // window.innerHeight から算出するため、リサイズ/回転で再計算しないと
  // カラムWebView（useDesktopColumns.ts の handleResize 経由で再配置される）と
  // オーバーレイの位置がズレる。デバウンス時間は useDesktopColumns.ts の
  // handleResize と揃えて100msにする。
  // syncMobileSwipeBar は globalSettings/anyDialogOpen/resolvedTheme が変わるたびに
  // 再生成されるため、ref 経由で最新版を呼ぶことでデバウンス中の再レンダーが
  // タイマーをリセットしてしまう競合を避ける（useDesktopColumns.ts の
  // recalculateRef と同じパターン）。
  const syncMobileSwipeBarRef = useRef(syncMobileSwipeBar);
  syncMobileSwipeBarRef.current = syncMobileSwipeBar;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        syncMobileSwipeBarRef.current();
      }, 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return syncMobileSwipeBar;
}

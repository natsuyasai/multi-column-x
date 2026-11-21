import { useEffect, useState } from "react";

/**
 * ダイアログ用: マウント時にフォーカスしていた要素を覚え、アンマウント時にそこへフォーカスを戻す。
 * 子の autoFocus より前に取得するため、保存は初回レンダー中に行う。
 */
export function useRestoreFocus(): void {
  const [previous] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    return () => {
      // 実際のアンマウントではダイアログの DOM が消えてフォーカスは body に落ちる。
      // StrictMode の擬似アンマウントや、他の要素がフォーカスを持っている場合は奪わない。
      const active = document.activeElement;
      const focusIsFree = active === null || active === document.body;
      if (focusIsFree && previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [previous]);
}

import { useEffect } from "react";
import type { RefObject } from "react";

export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutsideClick: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        onOutsideClick();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [ref, onOutsideClick, enabled]);
}

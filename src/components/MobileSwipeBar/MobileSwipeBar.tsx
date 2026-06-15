import React, { useRef } from "react";
import styles from "./MobileSwipeBar.module.scss";

const MIN_SWIPE_PX = 40;

interface Props {
  height: number;
  swipeState?: {
    direction: "left" | "right";
    phase: "progress" | "switching";
  } | null;
  onSwipeNavigate?: (direction: "left" | "right") => void;
}

export const MobileSwipeBar: React.FC<Props> = ({
  height,
  swipeState,
  onSwipeNavigate,
}) => {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const handleStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };

  const handleEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    onSwipeNavigate?.(dx < 0 ? "left" : "right");
  };

  const cancel = () => {
    swipeStart.current = null;
  };

  const className = [
    styles.swipeBar,
    swipeState?.phase === "switching" ? styles.switching : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ height }}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchCancel={cancel}
    >
      <span className={styles.hint}>‹</span>
      <span className={styles.grip}>⠿ スワイプで切替 ⠿</span>
      <span className={styles.hint}>›</span>
    </div>
  );
};

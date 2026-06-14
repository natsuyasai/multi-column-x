import React, { useRef } from "react";
import styles from "./MobileSwipeBar.module.scss";

const MIN_FLICK_PX = 40;
const MAX_FLICK_MS = 600;

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
  const flickStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const handleStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    flickStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleEnd = (e: React.TouchEvent) => {
    const start = flickStart.current;
    flickStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    if (Date.now() - start.time > MAX_FLICK_MS) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < MIN_FLICK_PX || Math.abs(dx) <= Math.abs(dy)) return;
    onSwipeNavigate?.(dx < 0 ? "left" : "right");
  };

  const cancel = () => {
    flickStart.current = null;
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

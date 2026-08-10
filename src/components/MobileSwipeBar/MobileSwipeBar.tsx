import React, { useRef } from "react";
import styles from "./MobileSwipeBar.module.scss";

const MIN_SWIPE_PX = 40;
const PROGRESS_MIN_PX = 10;

interface Props {
  height: number;
  swipeState?: {
    direction: "left" | "right";
    phase: "progress" | "switching";
  } | null;
  onSwipeNavigate?: (direction: "left" | "right") => void;
  onSwipeProgress?: (direction: "left" | "right" | null) => void;
}

export const MobileSwipeBar: React.FC<Props> = ({
  height,
  swipeState,
  onSwipeNavigate,
  onSwipeProgress,
}) => {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const progressDirection = useRef<"left" | "right" | null>(null);

  const handleStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };

  const handleMove = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    if (!start) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < PROGRESS_MIN_PX || Math.abs(dx) <= Math.abs(dy)) {
      if (progressDirection.current !== null) {
        progressDirection.current = null;
        onSwipeProgress?.(null);
      }
      return;
    }
    const direction = dx < 0 ? "left" : "right";
    if (progressDirection.current !== direction) {
      progressDirection.current = direction;
      onSwipeProgress?.(direction);
    }
  };

  const handleEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    progressDirection.current = null;
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
    if (progressDirection.current !== null) {
      progressDirection.current = null;
      onSwipeProgress?.(null);
    }
  };

  const progressClass =
    swipeState?.phase === "progress"
      ? swipeState.direction === "left"
        ? styles.progressLeft
        : styles.progressRight
      : "";

  const className = [
    styles.swipeBar,
    swipeState?.phase === "switching" ? styles.switching : "",
    progressClass,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ height }}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={cancel}
    >
      <span className={styles.hint}>‹</span>
      <span className={styles.grip}>⠿ スワイプで切替 ⠿</span>
      <span className={styles.hint}>›</span>
    </div>
  );
};

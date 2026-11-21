import React, { useCallback, useId, useRef, useState } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import styles from "./HelpPopover.module.scss";

interface HelpPopoverProps {
  /** トリガーボタンの aria-label / title、ポップオーバーの aria-label に使う */
  label: string;
  children: React.ReactNode;
}

export const HelpPopover: React.FC<HelpPopoverProps> = ({
  label,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  const close = () => setIsOpen(false);

  // Escape で閉じたときは、開いたトリガーへフォーカスを戻す（外側クリックではフォーカスを奪わない）
  const closeByEscape = useCallback(() => {
    if (!isOpen) return;
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [isOpen]);

  useEscapeKey(closeByEscape);
  useOutsideClick(containerRef, close, isOpen);

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        title={label}
      >
        ?
      </button>
      {isOpen && (
        <div
          id={popoverId}
          className={styles.popover}
          role="dialog"
          aria-label={label}
        >
          {children}
        </div>
      )}
    </div>
  );
};

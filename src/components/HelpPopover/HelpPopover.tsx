import React, { useRef, useState } from "react";
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

  const close = () => setIsOpen(false);

  useEscapeKey(close);
  useOutsideClick(containerRef, close, isOpen);

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={label}
        aria-expanded={isOpen}
        title={label}
      >
        ?
      </button>
      {isOpen && (
        <div className={styles.popover} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
};

import React from "react";
import styles from "./StatusMark.module.scss";

interface StatusMarkProps {
  kind: "success" | "warning" | "selected";
}

/** 成功・警告・選択中を色だけで伝えないための記号。読み上げは隣の本文や aria 属性に任せる */
export const StatusMark: React.FC<StatusMarkProps> = ({ kind }) => (
  <span className={styles.statusMark} aria-hidden="true" data-kind={kind}>
    {kind === "warning" ? "⚠" : "✓"}
  </span>
);

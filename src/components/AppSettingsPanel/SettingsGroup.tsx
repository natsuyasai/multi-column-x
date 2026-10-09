import { Children } from "react";
import type { ReactNode } from "react";
import styles from "./AppSettingsPanel.module.scss";

interface SettingsGroupProps {
  title: string;
  children?: ReactNode;
}

export const SettingsGroup = ({ title, children }: SettingsGroupProps) => {
  if (Children.toArray(children).length === 0) return null;
  return (
    <div className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      {children}
    </div>
  );
};

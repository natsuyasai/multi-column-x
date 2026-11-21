import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useRestoreFocus } from "../../hooks/useRestoreFocus";
import styles from "./ShortcutHelpDialog.module.scss";

interface ShortcutHelpDialogProps {
  onClose: () => void;
}

type ShortcutId =
  | "createPost"
  | "openUrlPopup"
  | "addColumn"
  | "manageAccounts"
  | "appSettings"
  | "toggleToolbar"
  | "jumpToColumn"
  | "reloadFocusedColumn"
  | "showHelp";

interface ShortcutEntry {
  keys: string;
  id: ShortcutId;
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: "Ctrl+T", id: "createPost" },
  { keys: "Ctrl+L", id: "openUrlPopup" },
  { keys: "Ctrl+N", id: "addColumn" },
  { keys: "Ctrl+Shift+A", id: "manageAccounts" },
  { keys: "Ctrl+,", id: "appSettings" },
  { keys: "Ctrl+B", id: "toggleToolbar" },
  { keys: "Ctrl+1〜9", id: "jumpToColumn" },
  { keys: "r", id: "reloadFocusedColumn" },
  { keys: "?", id: "showHelp" },
];

export const ShortcutHelpDialog: React.FC<ShortcutHelpDialogProps> = ({
  onClose,
}) => {
  const { t } = useTranslation();
  useEscapeKey(onClose);
  useRestoreFocus();
  const titleId = useId();

  return (
    <div className={styles.overlay}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className={styles.title}>
          {t("dialogs:shortcutHelp.title")}
        </h2>

        <ul className={styles.list}>
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className={styles.item}>
              <kbd className={styles.keys}>{shortcut.keys}</kbd>
              <span className={styles.description}>
                {t(`dialogs:shortcutHelp.items.${shortcut.id}`)}
              </span>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            {t("dialogs:shortcutHelp.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

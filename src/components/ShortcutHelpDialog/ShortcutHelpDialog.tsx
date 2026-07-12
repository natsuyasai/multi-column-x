import React from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import styles from "./ShortcutHelpDialog.module.scss";

interface ShortcutHelpDialogProps {
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string;
  description: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: "Ctrl+T", description: "ツイートを作成" },
  { keys: "Ctrl+L", description: "URLをポップアップで開く" },
  { keys: "Ctrl+N", description: "カラムを追加" },
  { keys: "Ctrl+Shift+A", description: "アカウント管理" },
  { keys: "Ctrl+,", description: "アプリ設定" },
  { keys: "Ctrl+B", description: "TopBarの折りたたみ/展開" },
  { keys: "Ctrl+1〜9", description: "指定カラムへジャンプ" },
  { keys: "r", description: "フォーカスカラムを更新" },
  { keys: "?", description: "このヘルプを表示" },
];

export const ShortcutHelpDialog: React.FC<ShortcutHelpDialogProps> = ({
  onClose,
}) => {
  useEscapeKey(onClose);

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>キーボードショートカット</h2>

        <ul className={styles.list}>
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className={styles.item}>
              <kbd className={styles.keys}>{shortcut.keys}</kbd>
              <span className={styles.description}>{shortcut.description}</span>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

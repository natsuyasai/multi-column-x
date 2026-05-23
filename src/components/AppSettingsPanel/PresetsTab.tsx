import React, { useState } from "react";
import type { ColumnPreset } from "../../types";
import styles from "./PresetsTab.module.scss";

interface PresetsTabProps {
  presets: ColumnPreset[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

export const PresetsTab: React.FC<PresetsTabProps> = ({
  presets,
  onSave,
  onLoad,
  onDelete,
}) => {
  const [presetName, setPresetName] = useState("");

  const handleSave = () => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setPresetName("");
  };

  return (
    <div className={styles.container}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>現在のレイアウトを保存</h3>
        <div className={styles.saveRow}>
          <input
            type="text"
            className={styles.nameInput}
            placeholder="プリセット名を入力"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!presetName.trim()}
          >
            現在のレイアウトを保存
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>保存済みプリセット</h3>
        {presets.length === 0 ? (
          <p className={styles.empty}>保存済みプリセットはありません</p>
        ) : (
          <ul className={styles.presetList}>
            {presets.map((preset) => (
              <li key={preset.id} className={styles.presetItem}>
                <span className={styles.presetName}>{preset.name}</span>
                <div className={styles.presetActions}>
                  <button
                    className={styles.loadBtn}
                    onClick={() => onLoad(preset.id)}
                  >
                    読み込む
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => onDelete(preset.id)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

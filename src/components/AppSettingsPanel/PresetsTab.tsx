import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        <h3 className={styles.sectionTitle}>
          {t("settings:presets.saveTitle")}
        </h3>
        <div className={styles.saveRow}>
          <input
            type="text"
            className={styles.nameInput}
            placeholder={t("settings:presets.namePlaceholder")}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!presetName.trim()}
          >
            {t("settings:presets.saveButton")}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:presets.savedTitle")}
        </h3>
        {presets.length === 0 ? (
          <p className={styles.empty}>{t("settings:presets.empty")}</p>
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
                    {t("settings:presets.load")}
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => onDelete(preset.id)}
                  >
                    {t("settings:presets.delete")}
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

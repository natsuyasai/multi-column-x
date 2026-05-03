import React, { useState } from "react";
import type { GlobalSettings } from "../../types";
import styles from "./AppSettingsPanel.module.scss";

interface AppSettingsPanelProps {
  settings: GlobalSettings;
  onApply: (patch: Partial<GlobalSettings>) => void;
  onClose: () => void;
}

export const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({
  settings,
  onApply,
  onClose,
}) => {
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(
    settings.defaultAutoReloadEnabled,
  );
  const [autoReloadInterval, setAutoReloadInterval] = useState(
    settings.defaultAutoReloadInterval,
  );
  const [popupEscCloseEnabled, setPopupEscCloseEnabled] = useState(
    settings.popupEscCloseEnabled,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      defaultAutoReloadEnabled: autoReloadEnabled,
      defaultAutoReloadInterval: autoReloadInterval,
      popupEscCloseEnabled: popupEscCloseEnabled,
    });
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>アプリ設定</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>カラムのデフォルト設定</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={autoReloadEnabled}
                onChange={(e) => setAutoReloadEnabled(e.target.checked)}
              />
              自動更新を有効にする
            </label>
            {autoReloadEnabled && (
              <label className={styles.fieldLabel}>
                更新間隔（秒）
                <input
                  type="number"
                  className={styles.numberInput}
                  min={10}
                  max={3600}
                  value={autoReloadInterval}
                  onChange={(e) =>
                    setAutoReloadInterval(Number(e.target.value))
                  }
                />
              </label>
            )}
            <p className={styles.hint}>
              新しく追加するカラムに適用されます
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>ポップアップウィンドウ</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={popupEscCloseEnabled}
                onChange={(e) => setPopupEscCloseEnabled(e.target.checked)}
              />
              Escキーで閉じる
            </label>
          </section>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              キャンセル
            </button>
            <button type="submit" className={styles.applyBtn}>
              適用
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

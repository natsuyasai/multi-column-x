import React, { useState } from "react";
import type { Column, ColumnSettings } from "../../types";
import styles from "./SettingsPanel.module.scss";

interface SettingsPanelProps {
  column: Column;
  onApply: (columnId: string, settings: ColumnSettings, width: number) => void;
  onClose: () => void;
  isMobile: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  column,
  onApply,
  onClose,
  isMobile,
}) => {
  const [settings, setSettings] = useState<ColumnSettings>({
    ...column.settings,
  });
  const [width, setWidth] = useState<number>(column.width);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(column.id, settings, width);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>カラム設定</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {!isMobile && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>カラム</h3>
              <label className={styles.fieldLabel}>
                幅（px）
                <input
                  type="number"
                  className={styles.numberInput}
                  min={200}
                  max={1200}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                />
              </label>
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>自動更新</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={settings.autoReloadEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    autoReloadEnabled: e.target.checked,
                  }))
                }
              />
              自動更新を有効にする
            </label>
            {settings.autoReloadEnabled && (
              <>
                <label className={styles.fieldLabel}>
                  更新間隔（秒）
                  <input
                    type="number"
                    className={styles.numberInput}
                    min={10}
                    max={3600}
                    value={settings.autoReloadInterval}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        autoReloadInterval: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showCountdown}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        showCountdown: e.target.checked,
                      }))
                    }
                  />
                  カウントダウンを表示する
                </label>
              </>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>表示</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={settings.areaRemoveEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    areaRemoveEnabled: e.target.checked,
                  }))
                }
              />
              ヘッダー・投稿欄を非表示にする
            </label>
            {settings.areaRemoveEnabled && (
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.showCustomMenu}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      showCustomMenu: e.target.checked,
                    }))
                  }
                />
                カスタムメニューボタンを表示する
              </label>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>カスタム CSS</h3>
            <textarea
              className={styles.cssTextarea}
              value={settings.customCSS}
              onChange={(e) =>
                setSettings((s) => ({ ...s, customCSS: e.target.value }))
              }
              placeholder="/* カスタムCSSを入力 */"
              spellCheck={false}
            />
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

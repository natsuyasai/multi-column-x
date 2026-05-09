import React, { useState } from "react";
import type { GlobalSettings, Column, Account } from "../../types";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import styles from "./AppSettingsPanel.module.scss";

interface AppSettingsPanelProps {
  settings: GlobalSettings;
  columns: Column[];
  accounts: Account[];
  onApply: (patch: Partial<GlobalSettings>) => void;
  onApplyLayout: (columns: Column[]) => void;
  onClose: () => void;
}

export const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({
  settings,
  columns,
  accounts,
  onApply,
  onApplyLayout,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "layout">("general");
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(
    settings.defaultAutoReloadEnabled,
  );
  const [autoReloadInterval, setAutoReloadInterval] = useState(
    settings.defaultAutoReloadInterval,
  );
  const [popupEscCloseEnabled, setPopupEscCloseEnabled] = useState(
    settings.popupEscCloseEnabled,
  );
  const [videoAutoPlayStopEnabled, setVideoAutoPlayStopEnabled] = useState(
    settings.videoAutoPlayStopEnabled,
  );
  const [showSortButtons, setShowSortButtons] = useState(
    settings.showSortButtons,
  );
  const [smallImageEnabled, setSmallImageEnabled] = useState(
    settings.smallImageEnabled,
  );
  const [smallImageWidth, setSmallImageWidth] = useState(
    settings.smallImageWidth,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      defaultAutoReloadEnabled: autoReloadEnabled,
      defaultAutoReloadInterval: autoReloadInterval,
      popupEscCloseEnabled: popupEscCloseEnabled,
      videoAutoPlayStopEnabled: videoAutoPlayStopEnabled,
      showSortButtons: showSortButtons,
      smallImageEnabled: smallImageEnabled,
      smallImageWidth: smallImageWidth,
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

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "general" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("general")}
          >
            一般
          </button>
          <button
            className={`${styles.tab} ${activeTab === "layout" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("layout")}
          >
            カラム配置
          </button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === "general" && (
            <form onSubmit={handleSubmit} className={styles.form}>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  カラムのデフォルト設定
                </h3>
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
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={showSortButtons}
                    onChange={(e) => setShowSortButtons(e.target.checked)}
                  />
                  並び替えボタンを表示する
                </label>
                <p className={styles.hint}>
                  新しく追加するカラムに適用されます
                </p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  ポップアップウィンドウ
                </h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={popupEscCloseEnabled}
                    onChange={(e) =>
                      setPopupEscCloseEnabled(e.target.checked)
                    }
                  />
                  Escキーで閉じる
                </label>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>動画</h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={videoAutoPlayStopEnabled}
                    onChange={(e) =>
                      setVideoAutoPlayStopEnabled(e.target.checked)
                    }
                  />
                  動画の自動再生を停止する
                </label>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>画像</h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={smallImageEnabled}
                    onChange={(e) => setSmallImageEnabled(e.target.checked)}
                  />
                  画像を縮小表示する
                </label>
                {smallImageEnabled && (
                  <label className={styles.fieldLabel}>
                    幅（例: 50%, 200px）
                    <input
                      type="text"
                      className={styles.textInput}
                      value={smallImageWidth}
                      onChange={(e) => setSmallImageWidth(e.target.value)}
                      placeholder="50%"
                    />
                  </label>
                )}
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
          )}

          {activeTab === "layout" && (
            <ColumnLayoutTab
              columns={columns}
              accounts={accounts}
              onApply={(updatedColumns) => {
                onApplyLayout(updatedColumns);
                onClose();
              }}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

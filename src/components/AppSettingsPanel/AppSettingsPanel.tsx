import React, { useState } from "react";
import type { GlobalSettings, Column, Account, ColumnSettings } from "../../types";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import styles from "./AppSettingsPanel.module.scss";

interface AppSettingsPanelProps {
  settings: GlobalSettings;
  columns: Column[];
  accounts: Account[];
  onApply: (patch: Partial<GlobalSettings>) => void;
  onApplyLayout: (columns: Column[]) => void;
  onApplyColumnDefaults: (patch: Pick<ColumnSettings, "autoReloadEnabled" | "autoReloadInterval">) => void;
  onReloadAllWebviews: () => void;
  onClose: () => void;
}

export const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({
  settings,
  columns,
  accounts,
  onApply,
  onApplyLayout,
  onApplyColumnDefaults,
  onReloadAllWebviews,
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
  const [hideAdEnabled, setHideAdEnabled] = useState(settings.hideAdEnabled);
  const [zoomLevel, setZoomLevel] = useState(settings.zoomLevel ?? 1);

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
      hideAdEnabled: hideAdEnabled,
      zoomLevel: zoomLevel,
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
            <form
              id="app-settings-form"
              onSubmit={handleSubmit}
              className={styles.form}
            >
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>表示</h3>
                <div className={styles.sliderRow}>
                  <span className={styles.sliderLabel}>表示サイズ</span>
                  <input
                    type="range"
                    className={styles.rangeSlider}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={zoomLevel}
                    onChange={(e) => setZoomLevel(Number(e.target.value))}
                  />
                  <span className={styles.sliderValue}>
                    {Math.round(zoomLevel * 100)}%
                  </span>
                </div>
              </section>

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
                <button
                  type="button"
                  className={styles.applyAllBtn}
                  onClick={() =>
                    onApplyColumnDefaults({
                      autoReloadEnabled,
                      autoReloadInterval,
                    })
                  }
                >
                  既存の全カラムに適用
                </button>
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
                <h3 className={styles.sectionTitle}>広告</h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={hideAdEnabled}
                    onChange={(e) => setHideAdEnabled(e.target.checked)}
                  />
                  広告を非表示にする
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

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>WebView</h3>
                <p className={styles.hint}>
                  全カラムのWebViewを順番に再生成します。設定は維持されます。
                </p>
                <button
                  type="button"
                  className={styles.applyAllBtn}
                  onClick={onReloadAllWebviews}
                >
                  全WebViewを再生成
                </button>
              </section>

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

        {activeTab === "general" && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="submit"
              form="app-settings-form"
              className={styles.applyBtn}
            >
              適用
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import type {
  GlobalSettings,
  Column,
  Account,
  ColumnSettings,
} from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import { PresetsTab } from "./PresetsTab";
import styles from "./AppSettingsPanel.module.scss";

interface AppSettingsPanelProps {
  settings: GlobalSettings;
  columns: Column[];
  accounts: Account[];
  onApply: (patch: Partial<GlobalSettings>) => void;
  onApplyLayout: (columns: Column[]) => void;
  onApplyColumnDefaults: (
    patch: Omit<ColumnSettings, "visibleLinks" | "ngWords">,
  ) => void;
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
  const isMobile = useAppStore((s) => s.isMobile);
  const { savePreset, loadPreset, deletePreset } = useAppStore();
  useEscapeKey(onClose);
  const [activeTab, setActiveTab] = useState<"general" | "layout" | "presets">(
    "general",
  );

  const [globalNgWordsText, setGlobalNgWordsText] = useState(
    (settings.ngWords ?? []).join("\n"),
  );

  // カラムデフォルト - 自動更新
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(
    settings.defaultAutoReloadEnabled,
  );
  const [autoReloadInterval, setAutoReloadInterval] = useState(
    settings.defaultAutoReloadInterval,
  );
  const [defaultShowCountdown, setDefaultShowCountdown] = useState(
    settings.defaultShowCountdown,
  );

  // カラムデフォルト - 表示
  const [defaultAreaRemoveEnabled, setDefaultAreaRemoveEnabled] = useState(
    settings.defaultAreaRemoveEnabled,
  );
  const [defaultShowCustomMenu, setDefaultShowCustomMenu] = useState(
    settings.defaultShowCustomMenu,
  );
  const [defaultScrollPosRestoreEnabled, setDefaultScrollPosRestoreEnabled] =
    useState(settings.defaultScrollPosRestoreEnabled);

  // カラムデフォルト - 画像
  const [smallImageEnabled, setSmallImageEnabled] = useState(
    settings.smallImageEnabled,
  );
  const [smallImageWidth, setSmallImageWidth] = useState(
    settings.smallImageWidth,
  );
  const [blurImageEnabled, setBlurImageEnabled] = useState(
    settings.blurImageEnabled,
  );
  const [blurImageAmount, setBlurImageAmount] = useState(
    settings.blurImageAmount,
  );

  // カラムデフォルト - カスタムCSS
  const [defaultColumnCustomCSS, setDefaultColumnCustomCSS] = useState(
    settings.defaultColumnCustomCSS,
  );

  // グローバル設定
  const [popupEscCloseEnabled, setPopupEscCloseEnabled] = useState(
    settings.popupEscCloseEnabled,
  );
  const [videoAutoPlayStopEnabled, setVideoAutoPlayStopEnabled] = useState(
    settings.videoAutoPlayStopEnabled,
  );
  const [hideAdEnabled, setHideAdEnabled] = useState(settings.hideAdEnabled);
  const [zoomLevel, setZoomLevel] = useState(settings.zoomLevel ?? 1);
  const [useXAppForCompose, setUseXAppForCompose] = useState(
    settings.useXAppForCompose ?? false,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ngWords = globalNgWordsText
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    onApply({
      defaultAutoReloadEnabled: autoReloadEnabled,
      defaultAutoReloadInterval: autoReloadInterval,
      defaultShowCountdown,
      defaultAreaRemoveEnabled,
      defaultShowCustomMenu,
      defaultScrollPosRestoreEnabled,
      defaultColumnCustomCSS,
      popupEscCloseEnabled,
      videoAutoPlayStopEnabled,
      smallImageEnabled,
      smallImageWidth,
      blurImageEnabled,
      blurImageAmount,
      hideAdEnabled,
      zoomLevel,
      useXAppForCompose,
      ngWords,
    });
    onClose();
  };

  const handleApplyColumnDefaults = () => {
    onApplyColumnDefaults({
      autoReloadEnabled,
      autoReloadInterval,
      showCountdown: defaultShowCountdown,
      areaRemoveEnabled: defaultAreaRemoveEnabled,
      showCustomMenu: defaultShowCustomMenu,
      scrollPosRestoreEnabled: defaultScrollPosRestoreEnabled,
      customCSS: defaultColumnCustomCSS,
      smallImageEnabled,
      smallImageWidth,
      blurImageEnabled,
      blurImageAmount,
    });
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
          {!isMobile && (
            <button
              className={`${styles.tab} ${activeTab === "presets" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("presets")}
            >
              プリセット
            </button>
          )}
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
                  カラムデフォルト - 自動更新
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
                  <>
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
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={defaultShowCountdown}
                        onChange={(e) =>
                          setDefaultShowCountdown(e.target.checked)
                        }
                      />
                      カウントダウンを表示する
                    </label>
                  </>
                )}
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>カラムデフォルト - 表示</h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={defaultAreaRemoveEnabled}
                    onChange={(e) =>
                      setDefaultAreaRemoveEnabled(e.target.checked)
                    }
                  />
                  ヘッダー・投稿欄を非表示にする
                </label>
                {defaultAreaRemoveEnabled && (
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={defaultShowCustomMenu}
                      onChange={(e) =>
                        setDefaultShowCustomMenu(e.target.checked)
                      }
                    />
                    カスタムメニューボタンを表示する
                  </label>
                )}
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={defaultScrollPosRestoreEnabled}
                    onChange={(e) =>
                      setDefaultScrollPosRestoreEnabled(e.target.checked)
                    }
                  />
                  写真閲覧後のスクロール位置を復元する
                </label>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>カラムデフォルト - 画像</h3>
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
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={blurImageEnabled}
                    onChange={(e) => setBlurImageEnabled(e.target.checked)}
                  />
                  画像をぼかして表示する
                </label>
                {blurImageEnabled && (
                  <label className={styles.fieldLabel}>
                    ブラー量（例: 10px）
                    <input
                      type="text"
                      className={styles.textInput}
                      value={blurImageAmount}
                      onChange={(e) => setBlurImageAmount(e.target.value)}
                      placeholder="10px"
                    />
                  </label>
                )}
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  カラムデフォルト - カスタムCSS
                </h3>
                <textarea
                  className={styles.cssTextarea}
                  value={defaultColumnCustomCSS}
                  onChange={(e) => setDefaultColumnCustomCSS(e.target.value)}
                  placeholder="/* カスタムCSSを入力 */"
                  spellCheck={false}
                />
                <p className={styles.hint}>
                  新しく追加するカラムに適用されます
                </p>
                <button
                  type="button"
                  className={styles.applyAllBtn}
                  onClick={handleApplyColumnDefaults}
                >
                  既存の全カラムに適用
                </button>
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

              {isMobile && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>ツイート（Android）</h3>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={useXAppForCompose}
                      onChange={(e) => setUseXAppForCompose(e.target.checked)}
                    />
                    ツイートボタンでXアプリを起動する
                  </label>
                </section>
              )}

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>グローバルNGワード</h3>
                <textarea
                  className={styles.cssTextarea}
                  value={globalNgWordsText}
                  onChange={(e) => setGlobalNgWordsText(e.target.value)}
                  placeholder="1行に1ワードで入力（全カラムに適用）"
                  spellCheck={false}
                />
                <p className={styles.hint}>
                  全カラムのタイムラインに適用されます。各カラムのNGワードと合わせて使用されます。
                </p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>WebView</h3>
                <p className={styles.hint}>
                  全カラムのWebViewを順番に再生成します。設定は維持されます。
                </p>
                <button
                  type="button"
                  className={styles.applyAllBtn}
                  onClick={() => {
                    onReloadAllWebviews();
                    onClose();
                  }}
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
              isMobile={isMobile}
            />
          )}

          {!isMobile && activeTab === "presets" && (
            <PresetsTab
              presets={settings.presets ?? []}
              onSave={(name) => savePreset(name)}
              onLoad={(id) => {
                loadPreset(id);
                onClose();
              }}
              onDelete={(id) => deletePreset(id)}
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

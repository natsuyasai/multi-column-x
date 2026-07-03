import React, { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useAppStore } from "../../store/useAppStore";
import type {
  GlobalSettings,
  Column,
  Account,
  ColumnSettings,
  ColumnScale,
} from "../../types";
import styles from "./AppSettingsPanel.module.scss";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import { PresetsTab } from "./PresetsTab";
import {
  clampSwipeAreaHeight,
  createSettingsDraft,
  type SettingsDraft,
} from "./settingsDraft";

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
  appVersion: string;
  updateChecking: boolean;
  updateManualResult: "idle" | "none" | "error";
  onCheckUpdate: () => void;
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
  appVersion,
  updateChecking,
  updateManualResult,
  onCheckUpdate,
  onClose,
}) => {
  const isMobile = useAppStore((s) => s.isMobile);
  const { savePreset, loadPreset, deletePreset } = useAppStore();
  useEscapeKey(onClose);
  const [activeTab, setActiveTab] = useState<"general" | "layout" | "presets">(
    "general",
  );

  const [draft, setDraft] = useState<SettingsDraft>(() =>
    createSettingsDraft(settings),
  );

  const set = <K extends keyof SettingsDraft>(
    key: K,
    value: SettingsDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ngWords = draft.globalNgWordsText
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    onApply({
      theme: draft.theme,
      defaultAutoReloadEnabled: draft.defaultAutoReloadEnabled,
      defaultAutoReloadInterval: draft.defaultAutoReloadInterval,
      defaultShowCountdown: draft.defaultShowCountdown,
      defaultAreaRemoveEnabled: draft.defaultAreaRemoveEnabled,
      defaultShowCustomMenu: draft.defaultShowCustomMenu,
      defaultScrollPosRestoreEnabled: draft.defaultScrollPosRestoreEnabled,
      defaultColumnCustomCSS: draft.defaultColumnCustomCSS,
      popupEscCloseEnabled: draft.popupEscCloseEnabled,
      videoAutoPlayStopEnabled: draft.videoAutoPlayStopEnabled,
      imagePopupEnabled: draft.imagePopupEnabled,
      videoPopupEnabled: draft.videoPopupEnabled,
      smallImageEnabled: draft.smallImageEnabled,
      smallImageWidth: draft.smallImageWidth,
      blurImageEnabled: draft.blurImageEnabled,
      blurImageAmount: draft.blurImageAmount,
      hideAdEnabled: draft.hideAdEnabled,
      columnScale: draft.columnScale,
      useXAppForCompose: draft.useXAppForCompose,
      mobileSwipeAreaEnabled: draft.mobileSwipeAreaEnabled,
      mobileSwipeAreaHeight: clampSwipeAreaHeight(draft.mobileSwipeAreaHeight),
      ngWords,
    });
    onClose();
  };

  const handleApplyColumnDefaults = () => {
    onApplyColumnDefaults({
      autoReloadEnabled: draft.defaultAutoReloadEnabled,
      autoReloadInterval: draft.defaultAutoReloadInterval,
      showCountdown: draft.defaultShowCountdown,
      areaRemoveEnabled: draft.defaultAreaRemoveEnabled,
      showCustomMenu: draft.defaultShowCustomMenu,
      scrollPosRestoreEnabled: draft.defaultScrollPosRestoreEnabled,
      customCSS: draft.defaultColumnCustomCSS,
      smallImageEnabled: draft.smallImageEnabled,
      smallImageWidth: draft.smallImageWidth,
      blurImageEnabled: draft.blurImageEnabled,
      blurImageAmount: draft.blurImageAmount,
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
                <div className={styles.scaleRow}>
                  <span className={styles.scaleLabel}>表示サイズ</span>
                  <div className={styles.scaleOptions}>
                    {(
                      [
                        { value: "small", label: "小" },
                        { value: "default", label: "標準" },
                        { value: "normal", label: "普通" },
                        { value: "large", label: "大" },
                        { value: "xLarge", label: "特大" },
                      ] as { value: ColumnScale; label: string }[]
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`${styles.scaleBtn} ${draft.columnScale === value ? styles.scaleBtnActive : ""}`}
                        onClick={() => set("columnScale", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.scaleRow}>
                  <span className={styles.scaleLabel}>テーマ</span>
                  <div className={styles.scaleOptions}>
                    {(
                      [
                        { value: "dark", label: "ダーク" },
                        { value: "light", label: "ライト" },
                        { value: "system", label: "システム" },
                      ] as {
                        value: "dark" | "light" | "system";
                        label: string;
                      }[]
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`${styles.scaleBtn} ${draft.theme === value ? styles.scaleBtnActive : ""}`}
                        onClick={() => set("theme", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  カラムデフォルト - 自動更新
                </h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draft.defaultAutoReloadEnabled}
                    onChange={(e) =>
                      set("defaultAutoReloadEnabled", e.target.checked)
                    }
                  />
                  自動更新を有効にする
                </label>
                {draft.defaultAutoReloadEnabled && (
                  <>
                    <label className={styles.fieldLabel}>
                      更新間隔（秒）
                      <input
                        type="number"
                        className={styles.numberInput}
                        min={10}
                        max={3600}
                        value={draft.defaultAutoReloadInterval}
                        onChange={(e) =>
                          set(
                            "defaultAutoReloadInterval",
                            Number(e.target.value),
                          )
                        }
                      />
                    </label>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={draft.defaultShowCountdown}
                        onChange={(e) =>
                          set("defaultShowCountdown", e.target.checked)
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
                    checked={draft.defaultAreaRemoveEnabled}
                    onChange={(e) =>
                      set("defaultAreaRemoveEnabled", e.target.checked)
                    }
                  />
                  ヘッダー・投稿欄を非表示にする
                </label>
                {draft.defaultAreaRemoveEnabled && (
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={draft.defaultShowCustomMenu}
                      onChange={(e) =>
                        set("defaultShowCustomMenu", e.target.checked)
                      }
                    />
                    カスタムメニューボタンを表示する
                  </label>
                )}
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draft.defaultScrollPosRestoreEnabled}
                    onChange={(e) =>
                      set("defaultScrollPosRestoreEnabled", e.target.checked)
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
                    checked={draft.smallImageEnabled}
                    onChange={(e) => set("smallImageEnabled", e.target.checked)}
                  />
                  画像を縮小表示する
                </label>
                {draft.smallImageEnabled && (
                  <label className={styles.fieldLabel}>
                    幅（例: 50%, 200px）
                    <input
                      type="text"
                      className={styles.textInput}
                      value={draft.smallImageWidth}
                      onChange={(e) => set("smallImageWidth", e.target.value)}
                      placeholder="50%"
                    />
                  </label>
                )}
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draft.blurImageEnabled}
                    onChange={(e) => set("blurImageEnabled", e.target.checked)}
                  />
                  画像をぼかして表示する
                </label>
                {draft.blurImageEnabled && (
                  <label className={styles.fieldLabel}>
                    ブラー量（例: 10px）
                    <input
                      type="text"
                      className={styles.textInput}
                      value={draft.blurImageAmount}
                      onChange={(e) => set("blurImageAmount", e.target.value)}
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
                  value={draft.defaultColumnCustomCSS}
                  onChange={(e) =>
                    set("defaultColumnCustomCSS", e.target.value)
                  }
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
                    checked={draft.popupEscCloseEnabled}
                    onChange={(e) =>
                      set("popupEscCloseEnabled", e.target.checked)
                    }
                  />
                  Escキーで閉じる
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draft.imagePopupEnabled}
                    onChange={(e) => set("imagePopupEnabled", e.target.checked)}
                  />
                  画像をポップアップウィンドウで開く
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draft.videoPopupEnabled}
                    onChange={(e) => set("videoPopupEnabled", e.target.checked)}
                  />
                  動画をポップアップウィンドウで開く
                </label>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>動画</h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draft.videoAutoPlayStopEnabled}
                    onChange={(e) =>
                      set("videoAutoPlayStopEnabled", e.target.checked)
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
                    checked={draft.hideAdEnabled}
                    onChange={(e) => set("hideAdEnabled", e.target.checked)}
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
                      checked={draft.useXAppForCompose}
                      onChange={(e) =>
                        set("useXAppForCompose", e.target.checked)
                      }
                    />
                    ツイートボタンでXアプリを起動する
                  </label>
                </section>
              )}

              {isMobile && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>
                    モバイル: スワイプ切替
                  </h3>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={draft.mobileSwipeAreaEnabled}
                      onChange={(e) =>
                        set("mobileSwipeAreaEnabled", e.target.checked)
                      }
                    />
                    スワイプでカラム切替を有効化
                  </label>
                  <label className={styles.fieldLabel}>
                    スワイプ領域の高さ(px)
                    {/* min/max は付けない: ネイティブの範囲検証がフォーム送信を
                        ブロックしてしまうため、補正は clampSwipeAreaHeight に一元化し
                        入力中は自由に編集できるようにする（確定は blur と適用時）。 */}
                    <input
                      type="number"
                      className={styles.numberInput}
                      value={draft.mobileSwipeAreaHeight}
                      onChange={(e) =>
                        set("mobileSwipeAreaHeight", e.target.value)
                      }
                      onBlur={() =>
                        set(
                          "mobileSwipeAreaHeight",
                          String(
                            clampSwipeAreaHeight(draft.mobileSwipeAreaHeight),
                          ),
                        )
                      }
                    />
                  </label>
                </section>
              )}

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>グローバルNGワード</h3>
                <textarea
                  className={styles.cssTextarea}
                  value={draft.globalNgWordsText}
                  onChange={(e) => set("globalNgWordsText", e.target.value)}
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

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>アプリ情報</h3>
                <p className={styles.hint}>現在のバージョン: {appVersion}</p>
                <button
                  type="button"
                  className={styles.applyAllBtn}
                  onClick={onCheckUpdate}
                  disabled={updateChecking}
                >
                  {updateChecking ? "確認中..." : "更新を確認"}
                </button>
                {updateManualResult === "none" && (
                  <p className={styles.hint}>最新のバージョンです</p>
                )}
                {updateManualResult === "error" && (
                  <p className={styles.hint}>更新の確認に失敗しました</p>
                )}
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

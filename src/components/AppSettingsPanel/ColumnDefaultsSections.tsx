import React from "react";
import styles from "./AppSettingsPanel.module.scss";
import type { SettingsDraft, SetSettingsDraft } from "./settingsDraft";

interface ColumnDefaultsSectionsProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
  onApplyToAllColumns: () => void;
}

/** 「カラムデフォルト」セクション群（自動更新・表示・画像・カスタムCSS） */
export const ColumnDefaultsSections: React.FC<ColumnDefaultsSectionsProps> = ({
  draft,
  set,
  onApplyToAllColumns,
}) => (
  <>
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>カラムデフォルト - 自動更新</h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.defaultAutoReloadEnabled}
          onChange={(e) => set("defaultAutoReloadEnabled", e.target.checked)}
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
                set("defaultAutoReloadInterval", Number(e.target.value))
              }
            />
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={draft.defaultShowCountdown}
              onChange={(e) => set("defaultShowCountdown", e.target.checked)}
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
          onChange={(e) => set("defaultAreaRemoveEnabled", e.target.checked)}
        />
        ヘッダー・投稿欄を非表示にする
      </label>
      {draft.defaultAreaRemoveEnabled && (
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.defaultShowCustomMenu}
            onChange={(e) => set("defaultShowCustomMenu", e.target.checked)}
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
      <h3 className={styles.sectionTitle}>カラムデフォルト - カスタムCSS</h3>
      <textarea
        className={styles.cssTextarea}
        value={draft.defaultColumnCustomCSS}
        onChange={(e) => set("defaultColumnCustomCSS", e.target.value)}
        placeholder="/* カスタムCSSを入力 */"
        spellCheck={false}
      />
      <p className={styles.hint}>新しく追加するカラムに適用されます</p>
      <button
        type="button"
        className={styles.applyAllBtn}
        onClick={onApplyToAllColumns}
      >
        既存の全カラムに適用
      </button>
    </section>
  </>
);

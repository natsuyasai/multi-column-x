import React from "react";
import styles from "./AppSettingsPanel.module.scss";
import {
  clampSwipeAreaHeight,
  type SettingsDraft,
  type SetSettingsDraft,
} from "./settingsDraft";

interface GeneralSettingsSectionsProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
  isMobile: boolean;
}

/**
 * 全体設定セクション群
 * （ポップアップウィンドウ・動画・広告・Android ツイート・スワイプ切替・グローバルNGワード）
 */
export const GeneralSettingsSections: React.FC<
  GeneralSettingsSectionsProps
> = ({ draft, set, isMobile }) => (
  <>
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>ポップアップウィンドウ</h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.popupEscCloseEnabled}
          onChange={(e) => set("popupEscCloseEnabled", e.target.checked)}
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
          onChange={(e) => set("videoAutoPlayStopEnabled", e.target.checked)}
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

    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>API残量モニター</h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.apiRateLimitMonitorEnabled}
          onChange={(e) => set("apiRateLimitMonitorEnabled", e.target.checked)}
        />
        API残量モニターを有効にする
      </label>
    </section>

    {isMobile && (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>ツイート（Android）</h3>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.useXAppForCompose}
            onChange={(e) => set("useXAppForCompose", e.target.checked)}
          />
          ツイートボタンでXアプリを起動する
        </label>
      </section>
    )}

    {isMobile && (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>モバイル: スワイプ切替</h3>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.mobileSwipeAreaEnabled}
            onChange={(e) => set("mobileSwipeAreaEnabled", e.target.checked)}
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
            onChange={(e) => set("mobileSwipeAreaHeight", e.target.value)}
            onBlur={() =>
              set(
                "mobileSwipeAreaHeight",
                String(clampSwipeAreaHeight(draft.mobileSwipeAreaHeight)),
              )
            }
          />
        </label>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.mobileTwoColumnEnabled}
            onChange={(e) => set("mobileTwoColumnEnabled", e.target.checked)}
          />
          広い画面で2カラム表示（タブレット・横向き）
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
  </>
);

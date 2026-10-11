import React from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  MOBILE_COLUMN_COUNT_MAX,
  MOBILE_COLUMN_COUNT_MIN,
} from "@/lib/gridLayout";
import { HelpPopover } from "../HelpPopover/HelpPopover";
import styles from "./AppSettingsPanel.module.scss";
import {
  clampSwipeAreaHeight,
  type SettingsDraft,
  type SetSettingsDraft,
} from "./settingsDraft";

const MOBILE_COLUMN_COUNT_OPTIONS = Array.from(
  { length: MOBILE_COLUMN_COUNT_MAX - MOBILE_COLUMN_COUNT_MIN + 1 },
  (_, i) => MOBILE_COLUMN_COUNT_MIN + i,
);

interface SectionProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
}

interface FilterSettingsSectionsProps extends SectionProps {
  ngWordsError?: string | null;
  repostHiddenUserIdsError?: string | null;
}

/** ポップアップウィンドウ設定セクション */
export const PopupSettingsSection: React.FC<SectionProps> = ({
  draft,
  set,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("settings:general.popup.title")}
      </h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.popupEscCloseEnabled}
          onChange={(e) => set("popupEscCloseEnabled", e.target.checked)}
        />
        {t("settings:general.popup.escClose")}
      </label>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.imagePopupEnabled}
          onChange={(e) => set("imagePopupEnabled", e.target.checked)}
        />
        {t("settings:general.popup.image")}
      </label>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.videoPopupEnabled}
          onChange={(e) => set("videoPopupEnabled", e.target.checked)}
        />
        {t("settings:general.popup.video")}
      </label>
    </section>
  );
};

/** 動画設定セクション */
export const VideoSettingsSection: React.FC<SectionProps> = ({
  draft,
  set,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("settings:general.video.title")}
      </h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.videoAutoPlayStopEnabled}
          onChange={(e) => set("videoAutoPlayStopEnabled", e.target.checked)}
        />
        {t("settings:general.video.autoPlayStop")}
      </label>
    </section>
  );
};

const AdSettingsSection: React.FC<SectionProps> = ({ draft, set }) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("settings:general.ad.title")}</h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.hideAdEnabled}
          onChange={(e) => set("hideAdEnabled", e.target.checked)}
        />
        {t("settings:general.ad.hide")}
      </label>
    </section>
  );
};

const ApiRateLimitSettingsSection: React.FC<SectionProps> = ({
  draft,
  set,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("settings:general.apiRateLimit.title")}
      </h3>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.apiRateLimitMonitorEnabled}
          onChange={(e) => set("apiRateLimitMonitorEnabled", e.target.checked)}
        />
        {t("settings:general.apiRateLimit.enable")}
      </label>
    </section>
  );
};

const NgWordsSection: React.FC<SectionProps & { error?: string | null }> = ({
  draft,
  set,
  error,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("settings:general.ngWords.title")}
        <HelpPopover label={t("settings:general.ngWords.helpLabel")}>
          <p>{t("settings:general.ngWords.helpLine")}</p>
          <p>
            <Trans
              i18nKey="settings:general.ngWords.helpRegex"
              components={{ code: <code /> }}
            />
          </p>
          <p>{t("settings:general.ngWords.helpExample")}</p>
        </HelpPopover>
      </h3>
      <textarea
        className={styles.cssTextarea}
        value={draft.globalNgWordsText}
        onChange={(e) => set("globalNgWordsText", e.target.value)}
        placeholder={t("settings:general.ngWords.placeholder")}
        spellCheck={false}
      />
      {error && <p className={styles.errorText}>{error}</p>}
      <p className={styles.hint}>{t("settings:general.ngWords.hint")}</p>
    </section>
  );
};

const RepostHiddenUsersSection: React.FC<
  SectionProps & { error?: string | null }
> = ({ draft, set, error }) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("settings:general.repostHidden.title")}
      </h3>
      <textarea
        className={styles.cssTextarea}
        value={draft.globalRepostHiddenUserIdsText}
        onChange={(e) => set("globalRepostHiddenUserIdsText", e.target.value)}
        aria-label={t("settings:general.repostHidden.title")}
        placeholder={t("settings:general.repostHidden.placeholder")}
        spellCheck={false}
      />
      {error && <p className={styles.errorText}>{error}</p>}
      <p className={styles.hint}>{t("settings:general.repostHidden.hint")}</p>
    </section>
  );
};

/** フィルタ系設定セクション群（グローバルNGワード・リポストを非表示にするユーザー・広告・API残量モニター） */
export const FilterSettingsSections: React.FC<FilterSettingsSectionsProps> = ({
  draft,
  set,
  ngWordsError,
  repostHiddenUserIdsError,
}) => (
  <>
    <NgWordsSection draft={draft} set={set} error={ngWordsError} />
    <RepostHiddenUsersSection
      draft={draft}
      set={set}
      error={repostHiddenUserIdsError}
    />
    <AdSettingsSection draft={draft} set={set} />
    <ApiRateLimitSettingsSection draft={draft} set={set} />
  </>
);

/** Android 専用設定セクション群（ツイート・モバイル: スワイプ切替）。表示条件は呼び出し側で制御する */
export const AndroidSettingsSections: React.FC<SectionProps> = ({
  draft,
  set,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:general.android.tweetTitle")}
        </h3>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.useXAppForCompose}
            onChange={(e) => set("useXAppForCompose", e.target.checked)}
          />
          {t("settings:general.android.useXApp")}
        </label>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:general.android.swipeTitle")}
        </h3>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.mobileSwipeAreaEnabled}
            onChange={(e) => set("mobileSwipeAreaEnabled", e.target.checked)}
          />
          {t("settings:general.android.swipeEnable")}
        </label>
        <label className={styles.fieldLabel}>
          {t("settings:general.android.swipeHeight")}
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
        <label className={styles.fieldLabel}>
          {t("settings:general.android.swipeOpacity", {
            value: draft.mobileSwipeAreaOpacity,
          })}
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft.mobileSwipeAreaOpacity}
            onChange={(e) =>
              set("mobileSwipeAreaOpacity", Number(e.target.value))
            }
          />
        </label>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.mobileTwoColumnEnabled}
            onChange={(e) => set("mobileTwoColumnEnabled", e.target.checked)}
          />
          {t("settings:general.android.multiColumn")}
        </label>
        {draft.mobileTwoColumnEnabled && (
          <label className={styles.fieldLabel}>
            {t("settings:general.android.columnCount")}
            <select
              className={styles.selectInput}
              value={draft.mobileColumnCount}
              onChange={(e) => set("mobileColumnCount", Number(e.target.value))}
            >
              {MOBILE_COLUMN_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
    </>
  );
};

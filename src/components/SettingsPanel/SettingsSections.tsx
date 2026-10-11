import React, { type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { HelpPopover } from "@/components/HelpPopover/HelpPopover";
import type { ColumnSettings } from "@/types";
import styles from "./SettingsPanel.module.scss";

export type UpdateSetting = <K extends keyof ColumnSettings>(
  key: K,
  value: ColumnSettings[K],
) => void;

interface SettingCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** 「チェックボックス + ラベル文言」の共通レイアウト */
const SettingCheckbox: React.FC<SettingCheckboxProps> = ({
  checked,
  onChange,
  children,
}) => (
  <label className={styles.checkLabel}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    {children}
  </label>
);

interface SettingsSectionProps {
  settings: ColumnSettings;
  updateSetting: UpdateSetting;
}

interface LineListSectionProps {
  text: string;
  error: string | null;
  onChange: (value: string) => void;
}

/** 「自動更新」セクション */
export const AutoReloadSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:autoReload.title")}
      </h3>
      <SettingCheckbox
        checked={settings.autoReloadEnabled}
        onChange={(checked) => updateSetting("autoReloadEnabled", checked)}
      >
        {t("columnSettings:autoReload.enable")}
      </SettingCheckbox>
      {settings.autoReloadEnabled && (
        <>
          <label className={styles.fieldLabel}>
            {t("columnSettings:autoReload.interval")}
            <input
              type="number"
              className={styles.numberInput}
              min={10}
              max={3600}
              value={settings.autoReloadInterval}
              onChange={(e) =>
                updateSetting("autoReloadInterval", Number(e.target.value))
              }
            />
          </label>
          <SettingCheckbox
            checked={settings.showCountdown}
            onChange={(checked) => updateSetting("showCountdown", checked)}
          >
            {t("columnSettings:autoReload.showCountdown")}
          </SettingCheckbox>
        </>
      )}
    </section>
  );
};

interface DisplaySectionProps extends SettingsSectionProps {
  showReturnToLastRead: boolean;
}

/** 「表示」セクション */
export const DisplaySection: React.FC<DisplaySectionProps> = ({
  settings,
  updateSetting,
  showReturnToLastRead,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:display.title")}
      </h3>
      <SettingCheckbox
        checked={settings.hideHeaderEnabled}
        onChange={(checked) => updateSetting("hideHeaderEnabled", checked)}
      >
        {t("columnSettings:display.hideHeader")}
      </SettingCheckbox>
      <SettingCheckbox
        checked={settings.hideTweetInputEnabled}
        onChange={(checked) => updateSetting("hideTweetInputEnabled", checked)}
      >
        {t("columnSettings:display.hideTweetInput")}
      </SettingCheckbox>
      {settings.hideHeaderEnabled && (
        <SettingCheckbox
          checked={settings.showCustomMenu}
          onChange={(checked) => updateSetting("showCustomMenu", checked)}
        >
          {t("columnSettings:display.showCustomMenu")}
        </SettingCheckbox>
      )}
      {settings.smallImageEnabled && (
        <SettingCheckbox
          checked={settings.scrollPosRestoreEnabled}
          onChange={(checked) =>
            updateSetting("scrollPosRestoreEnabled", checked)
          }
        >
          {t("columnSettings:display.scrollPosRestore")}
        </SettingCheckbox>
      )}
      {showReturnToLastRead && (
        <SettingCheckbox
          checked={settings.returnToLastReadEnabled}
          onChange={(checked) =>
            updateSetting("returnToLastReadEnabled", checked)
          }
        >
          {t("columnSettings:display.returnToLastRead")}
        </SettingCheckbox>
      )}
    </section>
  );
};

/** 「画像」セクション */
export const ImageSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("columnSettings:image.title")}</h3>
      <SettingCheckbox
        checked={settings.smallImageEnabled}
        onChange={(checked) => updateSetting("smallImageEnabled", checked)}
      >
        {t("columnSettings:image.small")}
      </SettingCheckbox>
      {settings.smallImageEnabled && (
        <label className={styles.fieldLabel}>
          {t("columnSettings:image.width")}
          <input
            type="text"
            className={styles.numberInput}
            value={settings.smallImageWidth}
            onChange={(e) => updateSetting("smallImageWidth", e.target.value)}
            placeholder="50%"
          />
        </label>
      )}
    </section>
  );
};

/** 「画像ブラー」セクション */
export const ImageBlurSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:imageBlur.title")}
      </h3>
      <SettingCheckbox
        checked={settings.blurImageEnabled}
        onChange={(checked) => updateSetting("blurImageEnabled", checked)}
      >
        {t("columnSettings:imageBlur.enable")}
      </SettingCheckbox>
      {settings.blurImageEnabled && (
        <label className={styles.fieldLabel}>
          {t("columnSettings:imageBlur.amount")}
          <input
            type="text"
            className={styles.textInput}
            value={settings.blurImageAmount}
            onChange={(e) => updateSetting("blurImageAmount", e.target.value)}
            placeholder="10px"
          />
        </label>
      )}
      <p className={styles.fieldLabel}>{t("columnSettings:imageBlur.hint")}</p>
    </section>
  );
};

/** 「通知」セクション */
export const NotificationSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:notification.title")}
      </h3>
      <SettingCheckbox
        checked={settings.desktopNotifyEnabled ?? false}
        onChange={(checked) => updateSetting("desktopNotifyEnabled", checked)}
      >
        {t("columnSettings:notification.desktopNotify")}
      </SettingCheckbox>
    </section>
  );
};

/** 「NGワード」セクション */
export const NgWordsSection: React.FC<LineListSectionProps> = ({
  text,
  error,
  onChange,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:ngWords.title")}
        <HelpPopover label={t("columnSettings:ngWords.helpLabel")}>
          <p>{t("columnSettings:ngWords.helpLine")}</p>
          <p>
            <Trans
              i18nKey="columnSettings:ngWords.helpRegex"
              components={{ code: <code /> }}
            />
          </p>
          <p>{t("columnSettings:ngWords.helpExample")}</p>
        </HelpPopover>
      </h3>
      <textarea
        className={styles.cssTextarea}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("columnSettings:ngWords.placeholder")}
        spellCheck={false}
      />
      {error && <p className={styles.errorText}>{error}</p>}
    </section>
  );
};

/** 「リポストを非表示にするユーザー」セクション */
export const RepostHiddenUsersSection: React.FC<LineListSectionProps> = ({
  text,
  error,
  onChange,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:repostHidden.title")}
      </h3>
      <textarea
        className={styles.cssTextarea}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("columnSettings:repostHidden.title")}
        placeholder={t("columnSettings:repostHidden.placeholder")}
        spellCheck={false}
      />
      {error && <p className={styles.errorText}>{error}</p>}
      <p className={styles.hint}>{t("columnSettings:repostHidden.hint")}</p>
    </section>
  );
};

interface WhitelistSectionProps
  extends LineListSectionProps, SettingsSectionProps {}

/** 「ホワイトリスト」セクション */
export const WhitelistSection: React.FC<WhitelistSectionProps> = ({
  text,
  error,
  onChange,
  settings,
  updateSetting,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:whitelist.title")}
        <HelpPopover label={t("columnSettings:whitelist.helpLabel")}>
          <p>{t("columnSettings:whitelist.helpPurpose")}</p>
          <p>{t("columnSettings:whitelist.helpLine")}</p>
          <p>
            <Trans
              i18nKey="columnSettings:whitelist.helpRegex"
              components={{ code: <code /> }}
            />
          </p>
        </HelpPopover>
      </h3>
      <SettingCheckbox
        checked={settings.whitelistEnabled}
        onChange={(checked) => updateSetting("whitelistEnabled", checked)}
      >
        {t("columnSettings:whitelist.enable")}
      </SettingCheckbox>
      <textarea
        className={styles.cssTextarea}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("columnSettings:whitelist.placeholder")}
        spellCheck={false}
        disabled={!settings.whitelistEnabled}
      />
      {error && <p className={styles.errorText}>{error}</p>}
    </section>
  );
};

/** 「カスタム CSS」セクション */
export const CustomCssSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("columnSettings:customCss.title")}
      </h3>
      <textarea
        className={styles.cssTextarea}
        value={settings.customCSS}
        onChange={(e) => updateSetting("customCSS", e.target.value)}
        placeholder={t("columnSettings:customCss.placeholder")}
        spellCheck={false}
      />
    </section>
  );
};

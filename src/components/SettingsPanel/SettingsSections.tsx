import React, { type ReactNode } from "react";
import type { ColumnSettings } from "../../types";
import { HelpPopover } from "../HelpPopover/HelpPopover";
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
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>自動更新</h3>
    <SettingCheckbox
      checked={settings.autoReloadEnabled}
      onChange={(checked) => updateSetting("autoReloadEnabled", checked)}
    >
      自動更新を有効にする
    </SettingCheckbox>
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
              updateSetting("autoReloadInterval", Number(e.target.value))
            }
          />
        </label>
        <SettingCheckbox
          checked={settings.showCountdown}
          onChange={(checked) => updateSetting("showCountdown", checked)}
        >
          カウントダウンを表示する
        </SettingCheckbox>
      </>
    )}
  </section>
);

interface DisplaySectionProps extends SettingsSectionProps {
  showReturnToLastRead: boolean;
}

/** 「表示」セクション */
export const DisplaySection: React.FC<DisplaySectionProps> = ({
  settings,
  updateSetting,
  showReturnToLastRead,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>表示</h3>
    <SettingCheckbox
      checked={settings.hideHeaderEnabled}
      onChange={(checked) => updateSetting("hideHeaderEnabled", checked)}
    >
      ヘッダーを非表示にする
    </SettingCheckbox>
    <SettingCheckbox
      checked={settings.hideTweetInputEnabled}
      onChange={(checked) => updateSetting("hideTweetInputEnabled", checked)}
    >
      投稿欄を非表示にする
    </SettingCheckbox>
    {settings.hideHeaderEnabled && (
      <SettingCheckbox
        checked={settings.showCustomMenu}
        onChange={(checked) => updateSetting("showCustomMenu", checked)}
      >
        カスタムメニューボタンを表示する
      </SettingCheckbox>
    )}
    <SettingCheckbox
      checked={settings.scrollPosRestoreEnabled}
      onChange={(checked) => updateSetting("scrollPosRestoreEnabled", checked)}
    >
      写真閲覧後のスクロール位置を復元する
    </SettingCheckbox>
    {showReturnToLastRead && (
      <SettingCheckbox
        checked={settings.returnToLastReadEnabled}
        onChange={(checked) =>
          updateSetting("returnToLastReadEnabled", checked)
        }
      >
        更新後に前回の続きへ戻るボタンを表示する
      </SettingCheckbox>
    )}
  </section>
);

/** 「画像」セクション */
export const ImageSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>画像</h3>
    <SettingCheckbox
      checked={settings.smallImageEnabled}
      onChange={(checked) => updateSetting("smallImageEnabled", checked)}
    >
      画像を縮小表示する
    </SettingCheckbox>
    {settings.smallImageEnabled && (
      <label className={styles.fieldLabel}>
        幅（例: 50%, 200px）
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

/** 「画像ブラー」セクション */
export const ImageBlurSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>画像ブラー</h3>
    <SettingCheckbox
      checked={settings.blurImageEnabled}
      onChange={(checked) => updateSetting("blurImageEnabled", checked)}
    >
      画像をぼかして表示する
    </SettingCheckbox>
    {settings.blurImageEnabled && (
      <label className={styles.fieldLabel}>
        ブラー量（例: 10px）
        <input
          type="text"
          className={styles.textInput}
          value={settings.blurImageAmount}
          onChange={(e) => updateSetting("blurImageAmount", e.target.value)}
          placeholder="10px"
        />
      </label>
    )}
    <p className={styles.fieldLabel}>
      右クリック（PC）または長押し（モバイル）でブラーを解除できます
    </p>
  </section>
);

/** 「通知」セクション */
export const NotificationSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>通知</h3>
    <SettingCheckbox
      checked={settings.desktopNotifyEnabled ?? false}
      onChange={(checked) => updateSetting("desktopNotifyEnabled", checked)}
    >
      新着をデスクトップ通知する
    </SettingCheckbox>
  </section>
);

/** 「NGワード」セクション */
export const NgWordsSection: React.FC<LineListSectionProps> = ({
  text,
  error,
  onChange,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>
      NGワード
      <HelpPopover label="NGワードの書き方">
        <p>1行に1ワードを入力してください。</p>
        <p>
          <code>/pattern/flags</code>{" "}
          の形式で入力すると正規表現として扱われます（大文字・小文字は区別しません）。
        </p>
        <p>例: {"/spam|広告/"}</p>
      </HelpPopover>
    </h3>
    <textarea
      className={styles.cssTextarea}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      placeholder="1行に1ワードで入力（/正規表現/flags 形式も指定可）"
      spellCheck={false}
    />
    {error && <p className={styles.errorText}>{error}</p>}
  </section>
);

/** 「リポストを非表示にするユーザー」セクション */
export const RepostHiddenUsersSection: React.FC<LineListSectionProps> = ({
  text,
  error,
  onChange,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>リポストを非表示にするユーザー</h3>
    <textarea
      className={styles.cssTextarea}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      aria-label="リポストを非表示にするユーザー"
      placeholder="1行に1ユーザーIDで入力"
      spellCheck={false}
    />
    {error && <p className={styles.errorText}>{error}</p>}
    <p className={styles.hint}>
      1行に1ユーザーID（@以降）。指定ユーザーがリポストした投稿を非表示にします
    </p>
  </section>
);

interface WhitelistSectionProps
  extends LineListSectionProps, SettingsSectionProps {}

/** 「ホワイトリスト」セクション */
export const WhitelistSection: React.FC<WhitelistSectionProps> = ({
  text,
  error,
  onChange,
  settings,
  updateSetting,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>
      ホワイトリスト
      <HelpPopover label="ホワイトリストの書き方">
        <p>
          指定したワードを含むツイートのみを表示します（NGワードとは逆の効果です）。
        </p>
        <p>1行に1ワードを入力してください。</p>
        <p>
          <code>/pattern/flags</code>{" "}
          の形式で入力すると正規表現として扱われます（大文字・小文字は区別しません）。
        </p>
      </HelpPopover>
    </h3>
    <SettingCheckbox
      checked={settings.whitelistEnabled}
      onChange={(checked) => updateSetting("whitelistEnabled", checked)}
    >
      ホワイトリストを有効にする
    </SettingCheckbox>
    <textarea
      className={styles.cssTextarea}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      placeholder="1行に1ワードで入力（/正規表現/flags 形式も指定可、ホワイトリスト）"
      spellCheck={false}
      disabled={!settings.whitelistEnabled}
    />
    {error && <p className={styles.errorText}>{error}</p>}
  </section>
);

/** 「カスタム CSS」セクション */
export const CustomCssSection: React.FC<SettingsSectionProps> = ({
  settings,
  updateSetting,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>カスタム CSS</h3>
    <textarea
      className={styles.cssTextarea}
      value={settings.customCSS}
      onChange={(e) => updateSetting("customCSS", e.target.value)}
      placeholder="/* カスタムCSSを入力 */"
      spellCheck={false}
    />
  </section>
);

import React from "react";
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
}) => (
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
);

/** 動画設定セクション */
export const VideoSettingsSection: React.FC<SectionProps> = ({
  draft,
  set,
}) => (
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
);

const AdSettingsSection: React.FC<SectionProps> = ({ draft, set }) => (
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
);

const ApiRateLimitSettingsSection: React.FC<SectionProps> = ({
  draft,
  set,
}) => (
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
);

const NgWordsSection: React.FC<SectionProps & { error?: string | null }> = ({
  draft,
  set,
  error,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>
      グローバルNGワード
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
      value={draft.globalNgWordsText}
      onChange={(e) => set("globalNgWordsText", e.target.value)}
      placeholder="1行に1ワードで入力（全カラムに適用・/正規表現/flags 形式も指定可）"
      spellCheck={false}
    />
    {error && <p className={styles.errorText}>{error}</p>}
    <p className={styles.hint}>
      全カラムのタイムラインに適用されます。各カラムのNGワードと合わせて使用されます。
    </p>
  </section>
);

const RepostHiddenUsersSection: React.FC<
  SectionProps & { error?: string | null }
> = ({ draft, set, error }) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>リポストを非表示にするユーザー</h3>
    <textarea
      className={styles.cssTextarea}
      value={draft.globalRepostHiddenUserIdsText}
      onChange={(e) => set("globalRepostHiddenUserIdsText", e.target.value)}
      aria-label="リポストを非表示にするユーザー"
      placeholder="1行に1ユーザーIDで入力（全カラムに適用）"
      spellCheck={false}
    />
    {error && <p className={styles.errorText}>{error}</p>}
    <p className={styles.hint}>
      1行に1ユーザーID（@以降）。指定ユーザーがリポストした投稿を非表示にします
    </p>
  </section>
);

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
}) => (
  <>
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
      <label className={styles.fieldLabel}>
        スワイプ領域の透過度({draft.mobileSwipeAreaOpacity}%)
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
        広い画面で複数カラム表示（タブレット・横向き）
      </label>
      {draft.mobileTwoColumnEnabled && (
        <label className={styles.fieldLabel}>
          同時表示する列数
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

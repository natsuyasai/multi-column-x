import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppTFunction } from "@/i18n/types";
import type { ExtensionPageKind } from "@/services/extensions";
import type { DetectResult, ExtensionBrowser, ExtensionEntry } from "@/types";
import styles from "./ExtensionsTab.module.scss";

interface ExtensionsTabProps {
  /** ポップアップ / オプションを開くアカウント。決まらなければ null */
  accountId: string | null;
  /** 追加・削除・有効無効の変更が成功したとき（全カラムの再読込に使う） */
  onExtensionsChanged: () => void;
  listExtensions: () => Promise<ExtensionEntry[]>;
  detectChromeExtensions: () => Promise<DetectResult>;
  /** フォルダ選択ダイアログ。キャンセルしたら null */
  pickFolder: () => Promise<string | null>;
  addFromFolder: (path: string) => Promise<unknown>;
  addChrome: (chromeId: string) => Promise<unknown>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  openPage: (
    id: string,
    kind: ExtensionPageKind,
    accountId: string,
  ) => Promise<void>;
}

const DETECT_KEY = "detect";
const PICK_KEY = "pick";

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const BROWSER_LABELS: Record<ExtensionBrowser, string> = {
  chrome: "Chrome",
  edge: "Edge",
};

function describeSource(entry: ExtensionEntry, t: AppTFunction): string {
  if (entry.source.kind === "folder") return entry.source.path;
  const browser = BROWSER_LABELS[entry.source.browser ?? "chrome"];
  return t("settings:extensions.sourceProfile", {
    browser,
    profile: entry.source.profile,
  });
}

export const ExtensionsTab: React.FC<ExtensionsTabProps> = ({
  accountId,
  onExtensionsChanged,
  listExtensions,
  detectChromeExtensions,
  pickFolder,
  addFromFolder,
  addChrome,
  setEnabled,
  remove,
  openPage,
}) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ExtensionEntry[]>([]);
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setEntries(await listExtensions());
  }, [listExtensions]);

  useEffect(() => {
    let cancelled = false;
    listExtensions().then(
      (items) => {
        if (!cancelled) setEntries(items);
      },
      (e: unknown) => {
        if (!cancelled) setError(toMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [listExtensions]);

  const busy = busyKey !== null;
  const storagePathGuideLines = [
    t("settings:extensions.storagePath.location"),
    t("settings:extensions.storagePath.example"),
    t("settings:extensions.storagePath.others"),
  ];

  /** 処理中表示とエラー表示を共通化する。変更系は成功時のみ再読込を通知する */
  const run = async (
    key: string,
    action: () => Promise<void>,
    changed: boolean,
  ) => {
    if (busy) return;
    setBusyKey(key);
    setError(null);
    try {
      await action();
      if (changed) {
        onExtensionsChanged();
        await refresh();
      }
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddFromFolder = () =>
    run(
      PICK_KEY,
      async () => {
        const path = await pickFolder();
        if (path === null) return;
        await addFromFolder(path);
        onExtensionsChanged();
        await refresh();
      },
      false,
    );

  const handleDetect = () =>
    run(
      DETECT_KEY,
      async () => {
        setDetected(await detectChromeExtensions());
      },
      false,
    );

  const handleAddChrome = (chromeId: string) =>
    run(
      `chrome:${chromeId}`,
      async () => {
        await addChrome(chromeId);
        setDetected((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.chromeId === chromeId ? { ...item, added: true } : item,
                ),
              }
            : prev,
        );
      },
      true,
    );

  const handleToggle = (entry: ExtensionEntry, enabled: boolean) =>
    run(`toggle:${entry.id}`, () => setEnabled(entry.id, enabled), true);

  const handleRemove = (entry: ExtensionEntry) =>
    run(`remove:${entry.id}`, () => remove(entry.id), true);

  // ポップアップ / オプションの表示は拡張機能の設定を変えないため、再読込は通知しない
  const handleOpen = (entry: ExtensionEntry, kind: ExtensionPageKind) =>
    run(
      `open:${kind}:${entry.id}`,
      async () => {
        if (accountId === null) return;
        await openPage(entry.id, kind, accountId);
      },
      false,
    );

  return (
    <div className={styles.container} aria-busy={busy}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:extensions.addTitle")}
        </h3>
        <p className={styles.note}>{t("settings:extensions.addNote")}</p>
        <div className={styles.guide}>
          {storagePathGuideLines.map((line) => (
            <p key={line} className={styles.note}>
              {line}
            </p>
          ))}
        </div>
        <p className={styles.note} role="note">
          {t("settings:extensions.trustNotice")}
        </p>
        <p className={styles.note}>
          {t("settings:extensions.unsupportedNotice")}
        </p>
        <p className={styles.note}>{t("settings:extensions.reloadNotice")}</p>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void handleDetect()}
            disabled={busy}
            aria-busy={busyKey === DETECT_KEY}
            aria-label={t("settings:extensions.detect")}
          >
            {t("settings:extensions.detect")}
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void handleAddFromFolder()}
            disabled={busy}
            aria-busy={busyKey === PICK_KEY}
            aria-label={t("settings:extensions.addFromFolder")}
          >
            {t("settings:extensions.addFromFolder")}
          </button>
        </div>
        {error && (
          <p role="alert" className={`${styles.message} ${styles.error}`}>
            {error}
          </p>
        )}
        {detected && !detected.browserFound && (
          <p role="status" className={`${styles.message} ${styles.warning}`}>
            {t("settings:extensions.browserNotFound")}
          </p>
        )}
        {detected?.browserFound && (
          <ul
            className={styles.list}
            aria-label={t("settings:extensions.candidatesLabel")}
          >
            {detected.items.length === 0 && (
              <li className={styles.note}>
                {t("settings:extensions.noCandidates")}
              </li>
            )}
            {detected.items.map((item) => (
              <li key={item.chromeId} className={styles.row}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.meta}>
                  {t("settings:extensions.candidateMeta", {
                    browser: BROWSER_LABELS[item.browser],
                    profile: item.profile,
                  })}
                </span>
                {item.added && (
                  <span className={styles.badge}>
                    {t("settings:extensions.added")}
                  </span>
                )}
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => void handleAddChrome(item.chromeId)}
                  disabled={busy || item.added}
                  aria-busy={busyKey === `chrome:${item.chromeId}`}
                  aria-label={t("settings:extensions.addLabel", {
                    name: item.name,
                  })}
                >
                  {t("settings:extensions.add")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:extensions.installedTitle")}
        </h3>
        {entries.length === 0 ? (
          <p className={styles.note}>
            {t("settings:extensions.installedEmpty")}
          </p>
        ) : (
          <ul
            className={styles.list}
            aria-label={t("settings:extensions.installedTitle")}
          >
            {entries.map((entry) => {
              const pageDisabled =
                busy || !entry.enabled || entry.missing || accountId === null;
              const pageTitle =
                accountId === null
                  ? t("settings:extensions.accountRequired")
                  : undefined;
              return (
                <li key={entry.id} className={styles.row}>
                  <div className={styles.nameBlock}>
                    <span className={styles.name}>{entry.name}</span>
                    <span className={styles.meta}>
                      {describeSource(entry, t)}
                    </span>
                  </div>
                  {entry.missing && (
                    <span className={`${styles.badge} ${styles.badgeWarn}`}>
                      {t("settings:extensions.missing")}
                    </span>
                  )}
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(e) =>
                        void handleToggle(entry, e.target.checked)
                      }
                      disabled={busy || entry.missing}
                      aria-label={t("settings:extensions.enableLabel", {
                        name: entry.name,
                      })}
                    />
                    {t("settings:extensions.enabled")}
                  </label>
                  {entry.hasPopup && (
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => void handleOpen(entry, "popup")}
                      disabled={pageDisabled}
                      title={pageTitle}
                      aria-label={t("settings:extensions.openPopupLabel", {
                        name: entry.name,
                      })}
                    >
                      {t("settings:extensions.openPopup")}
                    </button>
                  )}
                  {entry.hasOptions && (
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => void handleOpen(entry, "options")}
                      disabled={pageDisabled}
                      title={pageTitle}
                      aria-label={t("settings:extensions.openOptionsLabel", {
                        name: entry.name,
                      })}
                    >
                      {t("settings:extensions.openOptions")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => void handleRemove(entry)}
                    disabled={busy}
                    aria-busy={busyKey === `remove:${entry.id}`}
                    aria-label={t("settings:extensions.removeLabel", {
                      name: entry.name,
                    })}
                  >
                    {t("settings:extensions.remove")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
